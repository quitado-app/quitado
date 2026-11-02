// Finds the transaction that pays an invoice among everything that cites its reference.
//
// The reference is public once the payment link is shared, so anyone can land transactions that
// cite it. @solana/pay's findReference returns only the oldest one and ignores failures, which
// lets a griefer hide the real payment (see docs/spike-devnet.md). We examine every candidate.
import { evaluateTransaction, type RejectReason } from './evaluate.ts';
import type { ChainReader, Commitment, PaymentExpectation } from './types.ts';

export interface FoundPayment {
  signature: string;
  /** Base units the recipient gained. */
  received: bigint;
  /** Unix ms from the block time, or null if the cluster did not report one. */
  receivedAt: number | null;
  payer?: string;
}

export interface FindPaymentOptions {
  commitment: Commitment;
  /** Signatures per RPC call. Default 100. */
  pageSize?: number;
  /** Pages to walk back through. Default 5, so at most 500 candidates per reference. */
  maxPages?: number;
  /**
   * Signatures already judged "not the payment". A confirmed transaction never changes, so
   * remembering them saves an RPC call per candidate on every poll.
   */
  rejected?: Set<string>;
}

export interface FindPaymentResult {
  payment: FoundPayment | null;
  /** True when more candidates exist than we were willing to walk through. */
  truncated: boolean;
  /** Transactions fetched and judged in this call. */
  examined: number;
  /** Why each examined transaction was rejected, by signature. */
  rejections: Map<string, RejectReason>;
}

export async function findPayment(
  chain: ChainReader,
  expected: PaymentExpectation,
  options: FindPaymentOptions,
): Promise<FindPaymentResult> {
  const { commitment, pageSize = 100, maxPages = 5, rejected = new Set<string>() } = options;

  // Collect candidates newest to oldest, one page at a time. Failed transactions can never be
  // a payment, so they are dropped here without fetching them.
  const candidates: string[] = [];
  let before: string | undefined;
  let truncated = false;
  for (let page = 0; page < maxPages; page++) {
    const infos = await chain.getSignaturesForAddress(expected.reference, {
      limit: pageSize,
      commitment,
      ...(before === undefined ? {} : { before }),
    });
    for (const info of infos) if (info.err === null) candidates.push(info.signature);
    if (infos.length < pageSize) break;
    before = infos[infos.length - 1]!.signature;
    if (page === maxPages - 1) truncated = true;
  }

  // Oldest first, so the earliest valid payment wins.
  candidates.reverse();

  const rejections = new Map<string, RejectReason>();
  let examined = 0;
  for (const signature of candidates) {
    if (rejected.has(signature)) continue;
    const tx = await chain.getTransaction(signature, { commitment });
    // The node listed the signature but cannot serve it yet. Not a verdict: look again next time.
    if (tx === null) continue;
    examined += 1;

    const verdict = evaluateTransaction(tx, expected);
    if (verdict.valid) {
      const payment: FoundPayment = {
        signature,
        received: verdict.received,
        receivedAt: tx.blockTime === null ? null : tx.blockTime * 1000,
      };
      if (verdict.payer !== undefined) payment.payer = verdict.payer;
      return { payment, truncated, examined, rejections };
    }
    rejected.add(signature);
    rejections.set(signature, verdict.reason);
  }
  return { payment: null, truncated, examined, rejections };
}
