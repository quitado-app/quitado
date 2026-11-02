// Decides whether a confirmed transaction is the payment for an invoice.
//
// @solana/pay's validateTransfer requires the transfer to be the last instruction, so a wallet that
// appends one (guard or memo) would make a real payment look invalid (see docs/spike-devnet.md).
// Instead of reading instructions we read what actually happened: how much of the expected mint
// the recipient's token accounts gained in this transaction, and whether it cites the reference.
import type { ParsedTransaction, PaymentExpectation } from './types.ts';

export type RejectReason = 'failed' | 'reference_missing' | 'no_transfer' | 'insufficient';

export type Verdict =
  | {
      valid: true;
      /** Base units the recipient actually gained. May exceed the invoice amount. */
      received: bigint;
      /** Owner whose balance of the mint dropped the most, when there is one. */
      payer?: string;
    }
  | { valid: false; reason: RejectReason };

/** Net change of each owner's balance of `mint` across the transaction, in base units. */
function balanceDeltas(tx: ParsedTransaction, mint: string): Map<string, bigint> {
  const before = new Map<number, bigint>();
  for (const balance of tx.preTokenBalances) {
    if (balance.mint === mint) before.set(balance.accountIndex, balance.amount);
  }
  const deltas = new Map<string, bigint>();
  for (const balance of tx.postTokenBalances) {
    if (balance.mint !== mint) continue;
    // A token account created in this very transaction has no "before" entry: it started at zero.
    const delta = balance.amount - (before.get(balance.accountIndex) ?? 0n);
    deltas.set(balance.owner, (deltas.get(balance.owner) ?? 0n) + delta);
  }
  return deltas;
}

export function evaluateTransaction(tx: ParsedTransaction, expected: PaymentExpectation): Verdict {
  if (tx.err !== null) return { valid: false, reason: 'failed' };
  if (!tx.accountKeys.includes(expected.reference)) {
    return { valid: false, reason: 'reference_missing' };
  }

  const deltas = balanceDeltas(tx, expected.mint);
  const received = deltas.get(expected.recipient) ?? 0n;
  if (received <= 0n) return { valid: false, reason: 'no_transfer' };
  if (received < expected.amount) return { valid: false, reason: 'insufficient' };

  let payer: string | undefined;
  let largestDrop = 0n;
  for (const [owner, delta] of deltas) {
    if (owner !== expected.recipient && delta < largestDrop) {
      largestDrop = delta;
      payer = owner;
    }
  }
  return payer === undefined ? { valid: true, received } : { valid: true, received, payer };
}
