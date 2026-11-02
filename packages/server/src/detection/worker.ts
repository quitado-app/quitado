// Polls the chain for payments to open invoices and settles them.
//
// One poll walks every open invoice. Overdue invoices are polled too: a late payment is still money
// in the owner's wallet, so it must still settle the invoice (core: isOverdue is derived, not a state).
import { recordPayment, type Invoice } from '@quitado/core';
import type { InvoiceStore } from '../storage/index.ts';
import { StorageError } from '../storage/index.ts';
import { findPayment } from './find-payment.ts';
import type { ChainReader, Commitment } from './types.ts';

export type WorkerEvent =
  | { type: 'settled'; invoiceId: string; signature: string; received: bigint }
  | { type: 'conflict'; invoiceId: string; code: string; signature: string }
  | { type: 'truncated'; invoiceId: string }
  | { type: 'error'; invoiceId: string; message: string };

export interface WorkerOptions {
  store: InvoiceStore;
  chain: ChainReader;
  /** Wallet that receives payments. */
  recipient: string;
  /** Default 'finalized': slower by a few seconds, but a settled invoice can never be rolled back. */
  commitment?: Commitment;
  /** Invoices examined at the same time, to stay under RPC rate limits. Default 4. */
  concurrency?: number;
  now?: () => number;
  onEvent?: (event: WorkerEvent) => void;
}

export interface PollSummary {
  checked: number;
  settled: number;
  conflicts: number;
  errors: number;
}

export interface PaymentWorker {
  pollOnce(): Promise<PollSummary>;
  /** Polls every `intervalMs`, never overlapping two polls. */
  start(intervalMs: number): void;
  /** Stops scheduling and waits for the poll in flight. */
  stop(): Promise<void>;
}

const MAX_REMEMBERED_REJECTIONS = 1000;

async function mapLimit<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!);
  });
  await Promise.all(runners);
}

export function createPaymentWorker(options: WorkerOptions): PaymentWorker {
  const {
    store,
    chain,
    recipient,
    commitment = 'finalized',
    concurrency = 4,
    now = Date.now,
    onEvent = () => {},
  } = options;

  // Per invoice: signatures already judged "not the payment".
  const rejectedByInvoice = new Map<string, Set<string>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<unknown> = Promise.resolve();
  let stopped = true;

  async function check(invoice: Invoice, summary: PollSummary): Promise<void> {
    summary.checked += 1;
    try {
      let rejected = rejectedByInvoice.get(invoice.id);
      if (!rejected) rejectedByInvoice.set(invoice.id, (rejected = new Set()));
      if (rejected.size > MAX_REMEMBERED_REJECTIONS) rejected.clear();

      const result = await findPayment(
        chain,
        {
          recipient,
          mint: invoice.asset.mint,
          amount: invoice.amount,
          reference: invoice.reference,
        },
        { commitment, rejected },
      );
      if (result.truncated) onEvent({ type: 'truncated', invoiceId: invoice.id });
      const found = result.payment;
      if (!found) return;

      const paid = recordPayment(invoice, {
        signature: found.signature,
        amount: found.received,
        receivedAt: found.receivedAt ?? now(),
        ...(found.payer === undefined ? {} : { payer: found.payer }),
      });
      try {
        store.settle(paid);
      } catch (error) {
        if (
          error instanceof StorageError &&
          (error.code === 'duplicate_payment' || error.code === 'already_paid')
        ) {
          // One transaction cannot pay two invoices, and a paid invoice stays with its first
          // payment. Surface it for the owner to resolve; never overwrite or ignore silently.
          summary.conflicts += 1;
          onEvent({
            type: 'conflict',
            invoiceId: invoice.id,
            code: error.code,
            signature: found.signature,
          });
          return;
        }
        throw error;
      }
      rejectedByInvoice.delete(invoice.id);
      summary.settled += 1;
      onEvent({
        type: 'settled',
        invoiceId: invoice.id,
        signature: found.signature,
        received: found.received,
      });
    } catch (error) {
      // One invoice failing (RPC hiccup, rate limit) must not stop the others.
      summary.errors += 1;
      onEvent({
        type: 'error',
        invoiceId: invoice.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function pollOnce(): Promise<PollSummary> {
    const summary: PollSummary = { checked: 0, settled: 0, conflicts: 0, errors: 0 };
    await mapLimit(store.listOpen(), concurrency, (invoice) => check(invoice, summary));
    return summary;
  }

  function schedule(intervalMs: number): void {
    timer = setTimeout(() => {
      running = pollOnce()
        .catch(() => {})
        .finally(() => {
          if (!stopped) schedule(intervalMs);
        });
    }, intervalMs);
  }

  return {
    pollOnce,
    start(intervalMs) {
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('invalid interval');
      if (!stopped) return;
      stopped = false;
      schedule(intervalMs);
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
