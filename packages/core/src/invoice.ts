// Invoice domain: pure functions over plain data. Ids, references and the clock are injected so
// everything is deterministic and serializable; persistence and Solana access live elsewhere.
//
// An invoice is either 'open' or 'paid'. "Overdue" is derived (open and past its due date), not
// stored: a late payment is still money on chain, so it must still settle the invoice.
import type { Asset, AssetRegistry } from './assets.ts';
import { parseUnits } from './money.ts';

export class InvoiceError extends Error {
  override name = 'InvoiceError';
}

export type InvoiceStatus = 'open' | 'paid';

export interface Payment {
  /** Transaction signature that settled the invoice. */
  signature: string;
  /** Base units actually received. May exceed the invoice amount (overpayment is accepted). */
  amount: bigint;
  /** Unix ms when the payment was confirmed on chain. */
  receivedAt: number;
  /** Paying wallet, when known. */
  payer?: string;
}

export interface Invoice {
  id: string;
  /** Unique public key cited by the payment transaction; used to find the payment on chain. */
  reference: string;
  clientName: string;
  description: string;
  /** Snapshot of the asset at creation, so registry changes never alter old invoices. */
  asset: Asset;
  /** Base units requested. */
  amount: bigint;
  /** Unix ms. */
  dueAt: number;
  /** Unix ms. */
  createdAt: number;
  status: InvoiceStatus;
  payment?: Payment;
}

export interface NewInvoice {
  id: string;
  reference: string;
  clientName: string;
  description: string;
  /** Asset symbol, e.g. "USDC". */
  assetSymbol: string;
  /** Plain decimal text in the asset's units, e.g. "1250.50". */
  amount: string;
  dueAt: number;
}

// @solana/pay converts amounts through a JS number and rejects more than 15 significant digits
// (see docs/spike-devnet.md). With 6 decimals that means fewer than 10^9 whole units.
const MAX_WHOLE_UNITS = 1_000_000_000n;

const MAX_CLIENT_NAME = 200;
const MAX_DESCRIPTION = 1000;
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function createInvoice(input: NewInvoice, registry: AssetRegistry, now: number): Invoice {
  if (!input.id.trim()) throw new InvoiceError('id is required');
  if (!BASE58_ADDRESS.test(input.reference)) throw new InvoiceError('invalid reference');

  const clientName = input.clientName.trim();
  if (!clientName) throw new InvoiceError('client name is required');
  if (clientName.length > MAX_CLIENT_NAME) throw new InvoiceError('client name is too long');

  const description = input.description.trim();
  if (!description) throw new InvoiceError('description is required');
  if (description.length > MAX_DESCRIPTION) throw new InvoiceError('description is too long');

  if (!Number.isSafeInteger(input.dueAt) || input.dueAt <= now) {
    throw new InvoiceError('due date must be in the future');
  }

  const asset = registry.require(input.assetSymbol);
  const amount = parseUnits(input.amount, asset.decimals);
  if (amount <= 0n) throw new InvoiceError('amount must be greater than zero');
  if (amount >= MAX_WHOLE_UNITS * 10n ** BigInt(asset.decimals)) {
    throw new InvoiceError('amount is too large');
  }

  return {
    id: input.id,
    reference: input.reference,
    clientName,
    description,
    asset,
    amount,
    dueAt: input.dueAt,
    createdAt: now,
    status: 'open',
  };
}

export function isOverdue(invoice: Invoice, now: number): boolean {
  return invoice.status === 'open' && now > invoice.dueAt;
}

/**
 * Settles an invoice with a validated payment. Idempotent for the same signature, so a worker
 * that sees the same transaction twice does not fail. A second, different payment is an error to
 * surface for manual handling (refund or credit), never silently ignored.
 */
export function recordPayment(invoice: Invoice, payment: Payment): Invoice {
  if (invoice.status === 'paid') {
    if (invoice.payment?.signature === payment.signature) return invoice;
    throw new InvoiceError('invoice is already paid by a different transaction');
  }
  if (!payment.signature) throw new InvoiceError('payment signature is required');
  if (!Number.isSafeInteger(payment.receivedAt) || payment.receivedAt < 0) {
    throw new InvoiceError('invalid payment time');
  }
  if (payment.amount < invoice.amount) {
    throw new InvoiceError('payment is smaller than the invoice amount');
  }
  return { ...invoice, status: 'paid', payment: { ...payment } };
}
