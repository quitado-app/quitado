// Builds Solana Pay transfer request URLs: https://github.com/solana-foundation/pay (spec: transfer request).
// Written by hand so the amount stays exact decimal text and the server needs no @solana/pay at
// runtime; an interop test checks the output against the reference implementation.
import { formatUnits } from '@quitado/core';

export interface PaymentRequest {
  /** Wallet that receives the payment. */
  recipient: string;
  /** Base units. */
  amount: bigint;
  decimals: number;
  /** Token mint (the spec's spl-token parameter). */
  mint: string;
  /** Unique key the payer's transaction must cite. */
  reference: string;
  label?: string;
  message?: string;
}

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function buildPaymentUrl(request: PaymentRequest): string {
  for (const [name, value] of [
    ['recipient', request.recipient],
    ['mint', request.mint],
    ['reference', request.reference],
  ] as const) {
    if (!BASE58_ADDRESS.test(value)) throw new Error(`invalid ${name}`);
  }
  if (request.amount <= 0n) throw new Error('amount must be greater than zero');

  const params: [string, string][] = [
    ['amount', formatUnits(request.amount, request.decimals)],
    ['spl-token', request.mint],
    ['reference', request.reference],
  ];
  if (request.label) params.push(['label', request.label]);
  if (request.message) params.push(['message', request.message]);

  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `solana:${request.recipient}?${query}`;
}
