import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { getAddressDecoder } from '@solana/kit';

/**
 * Public invoice id: 128 random bits. The payment page URL is its only protection ("capability
 * URL"), so it must never be sequential or guessable.
 */
export function newInvoiceId(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * A fresh Solana Pay reference: a real ed25519 public key whose private half is discarded, so it
 * is valid anywhere a wallet or validator expects an address, and nobody can ever sign for it.
 */
export function newReference(): string {
  const { publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return getAddressDecoder().decode(der.subarray(der.length - 32));
}
