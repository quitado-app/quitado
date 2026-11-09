import { beforeEach, describe, expect, it } from 'vitest';
import { createInvoice, mainnetRegistry, type Invoice } from '@quitado/core';
import { createInvoiceStore, openDatabase, type InvoiceStore } from '../storage/index.ts';
import { createPaymentWorker, type WorkerEvent } from './worker.ts';
import { balance, FakeChain, OTHER_MINT, PAYER, paymentTx, RECIPIENT } from './test-utils.ts';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

// Three distinct valid base58 references, one per invoice.
const REFS = [
  'CWEDDyZExHR2bUgqu6LFqcvGS6ZZWB5MYgetmNZMkJTw',
  '4w8N1R9KkufzffQMotUxdkzWdUguo44JM7ihRn7RL3DZ',
  '6UYHUkYui18DuPxYVRoL9vua1ZBx4JoXXov65rm8f3ev',
] as const;

function invoice(n: number, amount = '10'): Invoice {
  return createInvoice(
    {
      id: `inv_${n}`,
      reference: REFS[n]!,
      clientName: 'Acme',
      description: 'Work',
      assetSymbol: 'USDC',
      amount,
      dueAt: NOW + 7 * DAY,
    },
    mainnetRegistry(),
    NOW,
  );
}

/** A payment of `amount` base units citing `reference`. */
const pay = (signature: string, reference: string, amount: bigint) =>
  paymentTx(signature, amount, {
    accountKeys: [PAYER, 'payer-ata', 'recipient-ata', RECIPIENT, reference],
  });

describe('payment worker', () => {
  let store: InvoiceStore;
  let chain: FakeChain;
  let events: WorkerEvent[];

  const worker = (extra: Partial<Parameters<typeof createPaymentWorker>[0]> = {}) =>
    createPaymentWorker({
      store,
      chain,
      recipient: RECIPIENT,
      now: () => NOW + 2 * DAY,
      onEvent: (event) => events.push(event),
      ...extra,
    });

  beforeEach(() => {
    store = createInvoiceStore(openDatabase(':memory:'));
    chain = new FakeChain();
    events = [];
  });

  it('settles an open invoice when its payment is on chain', async () => {
    store.insert(invoice(0));
    chain.add(REFS[0], pay('sig0', REFS[0], 10_000_000n));

    const summary = await worker().pollOnce();

    expect(summary).toEqual({ checked: 1, settled: 1, conflicts: 0, errors: 0 });
    const paid = store.get('inv_0');
    expect(paid?.status).toBe('paid');
    expect(paid?.payment).toEqual({
      signature: 'sig0',
      amount: 10_000_000n,
      receivedAt: 1_800_000_100_000,
      payer: PAYER,
    });
    expect(events).toEqual([
      { type: 'settled', invoiceId: 'inv_0', signature: 'sig0', received: 10_000_000n },
    ]);
  });

  it('leaves the invoice open when nothing pays it, or the payment is too small', async () => {
    store.insert(invoice(0));
    store.insert(invoice(1));
    chain.add(REFS[1], pay('dust', REFS[1], 9_999_999n));

    const summary = await worker().pollOnce();

    expect(summary).toEqual({ checked: 2, settled: 0, conflicts: 0, errors: 0 });
    expect(store.listOpen()).toHaveLength(2);
  });

  it('ignores a payment in the wrong mint', async () => {
    store.insert(invoice(0));
    // The recipient gains the full amount, but of another stablecoin.
    chain.add(
      REFS[0],
      paymentTx('other-mint', 10_000_000n, {
        accountKeys: [PAYER, RECIPIENT, REFS[0]],
        preTokenBalances: [balance(2, RECIPIENT, 0n, OTHER_MINT)],
        postTokenBalances: [balance(2, RECIPIENT, 10_000_000n, OTHER_MINT)],
      }),
    );
    expect((await worker().pollOnce()).settled).toBe(0);
    expect(store.get('inv_0')?.status).toBe('open');
  });

  it('is idempotent: polling again does not touch a settled invoice', async () => {
    store.insert(invoice(0));
    chain.add(REFS[0], pay('sig0', REFS[0], 10_000_000n));
    const w = worker();
    await w.pollOnce();
    const callsAfterFirst = chain.calls.signatures;

    const second = await w.pollOnce();

    expect(second).toEqual({ checked: 0, settled: 0, conflicts: 0, errors: 0 });
    expect(chain.calls.signatures).toBe(callsAfterFirst);
    expect(store.get('inv_0')?.payment?.signature).toBe('sig0');
  });

  it('settles a late payment on an overdue invoice', async () => {
    store.insert(invoice(0));
    chain.add(REFS[0], pay('late', REFS[0], 10_000_000n));
    const w = worker({ now: () => NOW + 60 * DAY });
    expect((await w.pollOnce()).settled).toBe(1);
  });

  it('records the amount actually received on an overpayment', async () => {
    store.insert(invoice(0));
    chain.add(REFS[0], pay('big', REFS[0], 12_500_000n));
    await worker().pollOnce();
    expect(store.get('inv_0')?.payment?.amount).toBe(12_500_000n);
  });

  it('uses its own clock when the cluster reports no block time', async () => {
    store.insert(invoice(0));
    chain.add(
      REFS[0],
      paymentTx('s', 10_000_000n, { blockTime: null, accountKeys: [PAYER, RECIPIENT, REFS[0]] }),
    );
    await worker().pollOnce();
    expect(store.get('inv_0')?.payment?.receivedAt).toBe(NOW + 2 * DAY);
  });

  it('keeps going when the chain fails for one invoice', async () => {
    store.insert(invoice(0));
    store.insert(invoice(1));
    chain.add(REFS[0], pay('sig0', REFS[0], 10_000_000n));
    chain.add(REFS[1], pay('sig1', REFS[1], 10_000_000n));
    chain.failOn.add(REFS[0]);

    const summary = await worker().pollOnce();

    expect(summary).toEqual({ checked: 2, settled: 1, conflicts: 0, errors: 1 });
    expect(store.get('inv_0')?.status).toBe('open');
    expect(store.get('inv_1')?.status).toBe('paid');
    expect(events).toContainEqual({
      type: 'error',
      invoiceId: 'inv_0',
      message: `rpc down for ${REFS[0]}`,
    });

    // The failure was transient: the next poll settles the first invoice.
    chain.failOn.clear();
    expect((await worker().pollOnce()).settled).toBe(1);
    expect(store.get('inv_0')?.status).toBe('paid');
  });

  it('reports a conflict when one transaction cites two invoices, and settles only the first', async () => {
    store.insert(invoice(0));
    store.insert(invoice(1));
    const shared = paymentTx('shared', 10_000_000n, {
      accountKeys: [PAYER, 'payer-ata', 'recipient-ata', RECIPIENT, REFS[0], REFS[1]],
    });
    chain.add(REFS[0], shared);
    chain.add(REFS[1], shared);

    const summary = await worker({ concurrency: 1 }).pollOnce();

    expect(summary).toEqual({ checked: 2, settled: 1, conflicts: 1, errors: 0 });
    expect(store.get('inv_0')?.status).toBe('paid');
    expect(store.get('inv_1')?.status).toBe('open');
    expect(events).toContainEqual({
      type: 'conflict',
      invoiceId: 'inv_1',
      code: 'duplicate_payment',
      signature: 'shared',
    });
  });

  it('reports a conflict once, not on every poll', async () => {
    store.insert(invoice(0));
    store.insert(invoice(1));
    const shared = paymentTx('shared', 10_000_000n, {
      accountKeys: [PAYER, 'payer-ata', 'recipient-ata', RECIPIENT, REFS[0], REFS[1]],
    });
    chain.add(REFS[0], shared);
    chain.add(REFS[1], shared);
    const poller = worker({ concurrency: 1 });

    expect((await poller.pollOnce()).conflicts).toBe(1);
    expect((await poller.pollOnce()).conflicts).toBe(0);
    expect((await poller.pollOnce()).conflicts).toBe(0);
    expect(events.filter((event) => event.type === 'conflict')).toHaveLength(1);
    // The invoice is still open, and a real payment of its own is still found.
    expect(store.get('inv_1')?.status).toBe('open');
    chain.add(REFS[1], pay('own', REFS[1], 10_000_000n));
    expect((await poller.pollOnce()).settled).toBe(1);
    expect(store.get('inv_1')?.payment?.signature).toBe('own');
  });

  it('limits how many invoices it examines at once', async () => {
    for (let n = 0; n < 3; n++) store.insert(invoice(n));
    let active = 0;
    let peak = 0;
    const original = chain.getSignaturesForAddress.bind(chain);
    chain.getSignaturesForAddress = async (address, opts) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return original(address, opts);
    };
    await worker({ concurrency: 2 }).pollOnce();
    expect(peak).toBe(2);
  });

  it('emits a truncation event when an invoice has too many candidates', async () => {
    store.insert(invoice(0));
    for (let i = 0; i < 520; i++) chain.add(REFS[0], pay(`spam-${i}`, REFS[0], 1n));
    await worker().pollOnce();
    expect(events).toContainEqual({ type: 'truncated', invoiceId: 'inv_0' });
  });

  describe('start and stop', () => {
    it('polls repeatedly and stop waits for the poll in flight', async () => {
      store.insert(invoice(0));
      const w = worker();
      w.start(5);
      await new Promise((resolve) => setTimeout(resolve, 60));
      chain.add(REFS[0], pay('sig0', REFS[0], 10_000_000n));
      await new Promise((resolve) => setTimeout(resolve, 60));
      await w.stop();

      expect(store.get('inv_0')?.status).toBe('paid');
      const callsAtStop = chain.calls.signatures;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(chain.calls.signatures).toBe(callsAtStop);
    });

    it('rejects an invalid interval', () => {
      expect(() => worker().start(0)).toThrow(/invalid interval/);
      expect(() => worker().start(Number.NaN)).toThrow(/invalid interval/);
    });
  });
});
