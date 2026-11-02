import { describe, expect, it } from 'vitest';
import { AssetError, mainnetRegistry } from './assets.ts';
import { AmountError } from './money.ts';
import {
  createInvoice,
  InvoiceError,
  isOverdue,
  recordPayment,
  type NewInvoice,
  type Payment,
} from './invoice.ts';

const registry = mainnetRegistry();
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const REFERENCE = 'E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL';

const input = (overrides: Partial<NewInvoice> = {}): NewInvoice => ({
  id: 'inv_1',
  reference: REFERENCE,
  clientName: '  Acme Inc  ',
  description: 'Website redesign, October',
  assetSymbol: 'USDC',
  amount: '1250.50',
  dueAt: NOW + 7 * DAY,
  ...overrides,
});

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  signature: 'sig_1',
  amount: 1_250_500_000n,
  receivedAt: NOW + DAY,
  ...overrides,
});

describe('createInvoice', () => {
  it('creates an open invoice with exact base units and an asset snapshot', () => {
    const invoice = createInvoice(input(), registry, NOW);
    expect(invoice).toMatchObject({
      id: 'inv_1',
      reference: REFERENCE,
      clientName: 'Acme Inc',
      amount: 1_250_500_000n,
      createdAt: NOW,
      dueAt: NOW + 7 * DAY,
      status: 'open',
    });
    expect(invoice.asset).toEqual({
      symbol: 'USDC',
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
    });
    expect(invoice.payment).toBeUndefined();
  });

  it('supports USDT', () => {
    expect(createInvoice(input({ assetSymbol: 'USDT' }), registry, NOW).asset.symbol).toBe('USDT');
  });

  it('rejects unsupported assets and bad amounts', () => {
    expect(() => createInvoice(input({ assetSymbol: 'DAI' }), registry, NOW)).toThrow(AssetError);
    expect(() => createInvoice(input({ amount: '1.2345678' }), registry, NOW)).toThrow(AmountError);
    expect(() => createInvoice(input({ amount: '-5' }), registry, NOW)).toThrow(AmountError);
    expect(() => createInvoice(input({ amount: '0' }), registry, NOW)).toThrow(/greater than zero/);
    expect(() => createInvoice(input({ amount: '0.000000' }), registry, NOW)).toThrow(
      /greater than zero/,
    );
  });

  it('enforces the maximum amount the Solana Pay library can carry exactly', () => {
    expect(createInvoice(input({ amount: '999999999.999999' }), registry, NOW).amount).toBe(
      999_999_999_999_999n,
    );
    expect(() => createInvoice(input({ amount: '1000000000' }), registry, NOW)).toThrow(
      /too large/,
    );
  });

  it('validates text fields', () => {
    expect(() => createInvoice(input({ id: ' ' }), registry, NOW)).toThrow(InvoiceError);
    expect(() => createInvoice(input({ reference: 'nope' }), registry, NOW)).toThrow(/reference/);
    expect(() => createInvoice(input({ clientName: '   ' }), registry, NOW)).toThrow(/client name/);
    expect(() => createInvoice(input({ clientName: 'x'.repeat(201) }), registry, NOW)).toThrow(
      /too long/,
    );
    expect(() => createInvoice(input({ description: '' }), registry, NOW)).toThrow(/description/);
    expect(() => createInvoice(input({ description: 'x'.repeat(1001) }), registry, NOW)).toThrow(
      /too long/,
    );
  });

  it('requires a due date in the future', () => {
    expect(() => createInvoice(input({ dueAt: NOW }), registry, NOW)).toThrow(/future/);
    expect(() => createInvoice(input({ dueAt: NOW - 1 }), registry, NOW)).toThrow(/future/);
    expect(() => createInvoice(input({ dueAt: NOW + 0.5 }), registry, NOW)).toThrow(/future/);
    expect(() => createInvoice(input({ dueAt: Number.NaN }), registry, NOW)).toThrow(/future/);
  });
});

describe('isOverdue', () => {
  const invoice = createInvoice(input(), registry, NOW);

  it('is derived from status and the clock', () => {
    expect(isOverdue(invoice, NOW)).toBe(false);
    expect(isOverdue(invoice, invoice.dueAt)).toBe(false);
    expect(isOverdue(invoice, invoice.dueAt + 1)).toBe(true);
  });

  it('is never overdue once paid', () => {
    const paid = recordPayment(invoice, payment());
    expect(isOverdue(paid, invoice.dueAt + 30 * DAY)).toBe(false);
  });
});

describe('recordPayment', () => {
  const invoice = createInvoice(input(), registry, NOW);

  it('settles an invoice and records what was actually received', () => {
    const paid = recordPayment(invoice, payment({ payer: 'PayerWallet' }));
    expect(paid.status).toBe('paid');
    expect(paid.payment).toEqual({
      signature: 'sig_1',
      amount: 1_250_500_000n,
      receivedAt: NOW + DAY,
      payer: 'PayerWallet',
    });
  });

  it('does not mutate the original invoice', () => {
    recordPayment(invoice, payment());
    expect(invoice.status).toBe('open');
    expect(invoice.payment).toBeUndefined();
  });

  it('accepts an overpayment and keeps the larger amount', () => {
    const paid = recordPayment(invoice, payment({ amount: 1_300_000_000n }));
    expect(paid.payment?.amount).toBe(1_300_000_000n);
    expect(paid.amount).toBe(1_250_500_000n);
  });

  it('rejects an underpayment and leaves the invoice open', () => {
    expect(() => recordPayment(invoice, payment({ amount: 1_250_499_999n }))).toThrow(/smaller/);
  });

  it('still settles a late payment', () => {
    const late = payment({ receivedAt: invoice.dueAt + 10 * DAY });
    expect(recordPayment(invoice, late).status).toBe('paid');
  });

  it('is idempotent for the same signature', () => {
    const paid = recordPayment(invoice, payment());
    expect(recordPayment(paid, payment())).toBe(paid);
  });

  it('refuses a second, different payment', () => {
    const paid = recordPayment(invoice, payment());
    expect(() => recordPayment(paid, payment({ signature: 'sig_2' }))).toThrow(
      /different transaction/,
    );
  });

  it('validates the payment itself', () => {
    expect(() => recordPayment(invoice, payment({ signature: '' }))).toThrow(/signature/);
    expect(() => recordPayment(invoice, payment({ receivedAt: -1 }))).toThrow(/payment time/);
    expect(() => recordPayment(invoice, payment({ receivedAt: Number.NaN }))).toThrow(
      /payment time/,
    );
  });
});
