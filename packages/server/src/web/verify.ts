// Re-checks a recorded payment against the Solana blockchain, so that the page that says "paid" does
// not rest on Quitado's own database alone. Pure of I/O except through the injected chain reader.
import type { Invoice } from '@quitado/core';
import { evaluateTransaction } from '../detection/evaluate.ts';
import type { ChainReader } from '../detection/types.ts';

export type VerifyOutcome =
  | {
      kind: 'verified';
      /** Base units the recipient gained in that transaction, read from the chain just now. */
      received: bigint;
      /** Owner whose balance of the token dropped the most, when there is one. */
      payer?: string;
      /** Unix seconds from the chain; null when the cluster did not report it. */
      blockTime: number | null;
    }
  /** The chain was read, and it does not show the payment the database says happened. */
  | { kind: 'mismatch' }
  /** The network could not be read (or does not have the transaction): no verdict either way. */
  | { kind: 'unavailable' };

/** The most results kept: a finalized transaction never changes, so a verified one is reusable. */
const CACHE_LIMIT = 500;

export interface PaymentVerifier {
  verify(invoice: Invoice): Promise<VerifyOutcome>;
}

/**
 * Reads the transaction at `finalized` and judges it with the same rules the payment detection used:
 * the reference is in it, it did not fail, and the recipient's balance of the token rose by at least
 * the invoice amount. Only verified results are cached (they cannot change); a failure to read the
 * network is never remembered, so a later try asks again.
 */
export function createPaymentVerifier(
  chain: ChainReader | undefined,
  recipient: string,
): PaymentVerifier {
  const verified = new Map<string, VerifyOutcome>();
  return {
    async verify(invoice) {
      const payment = invoice.payment;
      if (!payment || !chain) return { kind: 'unavailable' };
      const cached = verified.get(payment.signature);
      if (cached) return cached;

      let tx;
      try {
        tx = await chain.getTransaction(payment.signature, { commitment: 'finalized' });
      } catch {
        return { kind: 'unavailable' };
      }
      if (!tx) return { kind: 'unavailable' };

      const verdict = evaluateTransaction(tx, {
        recipient,
        mint: invoice.asset.mint,
        amount: invoice.amount,
        reference: invoice.reference,
      });
      if (!verdict.valid) return { kind: 'mismatch' };

      const outcome: VerifyOutcome = {
        kind: 'verified',
        received: verdict.received,
        blockTime: tx.blockTime,
        ...(verdict.payer === undefined ? {} : { payer: verdict.payer }),
      };
      if (verified.size >= CACHE_LIMIT) {
        const oldest = verified.keys().next().value;
        if (oldest !== undefined) verified.delete(oldest);
      }
      verified.set(payment.signature, outcome);
      return outcome;
    },
  };
}
