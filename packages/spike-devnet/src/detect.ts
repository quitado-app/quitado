// Robust payment detection, seed of the step 4 worker.
//
// @solana/pay's findReference returns the OLDEST signature that cites the reference and does not
// look at its error status. Since the reference is public once the payment link is shared,
// anyone can land a failing (or wrong) transaction that cites it first and hide the real payment.
// Here we look at every candidate, skip failed ones and return the first one that validates.
import { validateTransfer, ValidateTransferError, type TransferFields } from '@solana/pay';
import type {
  Address,
  GetSignaturesForAddressApi,
  GetTransactionApi,
  Rpc,
  Signature,
} from '@solana/kit';

// Bounds the work an attacker can force by spamming transactions that cite the reference.
const MAX_CANDIDATES = 100;

export async function detectPayment(
  rpc: Rpc<GetSignaturesForAddressApi & GetTransactionApi>,
  reference: Address,
  fields: TransferFields,
): Promise<{ signature: Signature; skipped: number } | null> {
  const candidates = await rpc
    .getSignaturesForAddress(reference, { commitment: 'confirmed', limit: MAX_CANDIDATES })
    .send();

  // The RPC returns newest first; examine the oldest first so the earliest valid payment wins.
  const ordered = candidates.filter((c) => c.err === null).reverse();
  let skipped = candidates.length - ordered.length;

  for (const candidate of ordered) {
    try {
      await validateTransfer(rpc, candidate.signature, fields, { commitment: 'confirmed' });
      return { signature: candidate.signature, skipped };
    } catch (error) {
      // Only "this transaction is not the payment" is expected; anything else (RPC down) must surface.
      if (!(error instanceof ValidateTransferError)) throw error;
      skipped += 1;
    }
  }
  return null;
}
