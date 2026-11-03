import { beforeEach, describe, expect, it } from 'vitest';
import { createInvoice, mainnetRegistry, recordPayment, type Invoice } from '@quitado/core';
import { newReference } from '../web/ids.ts';
import { createInvoiceStore, openDatabase, type InvoiceStore } from './index.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0); // 15 Nov 2026
const registry = mainnetRegistry();

let counter = 0;
function make(symbol: 'USDC' | 'USDT', amount: string, dueInDays = 10): Invoice {
  counter += 1;
  return createInvoice(
    {
      id: `inv_${counter}`,
      reference: newReference(),
      clientName: 'Client',
      description: 'Work',
      assetSymbol: symbol,
      amount,
      dueAt: NOW + dueInDays * DAY,
    },
    registry,
    NOW - 30 * DAY, // created a month ago, so due dates in the past are allowed
  );
}

describe('store.stats', () => {
  let store: InvoiceStore;
  beforeEach(() => {
    store = createInvoiceStore(openDatabase(':memory:'));
    counter = 0;
  });

  const pay = (invoice: Invoice, receivedAt: number, extra = 0n) => {
    store.settle(
      recordPayment(invoice, {
        signature: `sig_${invoice.id}`,
        amount: invoice.amount + extra,
        receivedAt,
      }),
    );
  };

  it('is all zeros for an empty database', () => {
    expect(store.stats(NOW, 0)).toEqual({
      total: 0,
      open: 0,
      paid: 0,
      overdue: 0,
      byAsset: [],
      byMonth: [],
    });
  });

  it('counts invoices by state, treating "overdue" as open and past due', () => {
    const paid = make('USDC', '100');
    const open = make('USDC', '50', 10); // due in the future
    const late = make('USDC', '25', -3); // due 3 days ago, still unpaid
    [paid, open, late].forEach((invoice) => store.insert(invoice));
    pay(paid, NOW - DAY);

    expect(store.stats(NOW, 0)).toMatchObject({ total: 3, open: 2, paid: 1, overdue: 1 });
  });

  it('does not count a paid invoice as overdue even when it was paid after its due date', () => {
    const invoice = make('USDC', '10', -5);
    store.insert(invoice);
    pay(invoice, NOW - DAY);
    expect(store.stats(NOW, 0)).toMatchObject({ paid: 1, overdue: 0 });
  });

  it('totals invoiced and received per token, with the amount actually received', () => {
    const a = make('USDC', '100');
    const b = make('USDC', '40');
    const c = make('USDT', '7.5');
    [a, b, c].forEach((invoice) => store.insert(invoice));
    pay(a, NOW - 2 * DAY, 5_000_000n); // overpaid by 5 USDC
    pay(c, NOW - DAY);

    expect(store.stats(NOW, 0).byAsset).toEqual([
      {
        symbol: 'USDC',
        decimals: 6,
        invoices: 2,
        paid: 1,
        invoiced: 140_000_000n,
        received: 105_000_000n,
      },
      {
        symbol: 'USDT',
        decimals: 6,
        invoices: 1,
        paid: 1,
        invoiced: 7_500_000n,
        received: 7_500_000n,
      },
    ]);
  });

  it('keeps sums exact above 2^53, where a float would round', () => {
    // Ten invoices of the largest allowed amount: 9,999,999,999,999,990 base units.
    for (let i = 0; i < 10; i++) {
      const invoice = make('USDC', '999999999.999999');
      store.insert(invoice);
      pay(invoice, NOW - DAY);
    }
    const [usdc] = store.stats(NOW, 0).byAsset;
    expect(usdc?.received).toBe(9_999_999_999_999_990n);
    expect(usdc?.invoiced).toBe(9_999_999_999_999_990n);
    expect(Number.MAX_SAFE_INTEGER).toBeLessThan(9_999_999_999_999_990);
  });

  describe('by month', () => {
    it('groups payments by month and token, newest month first', () => {
      const invoices = [
        make('USDC', '10'),
        make('USDC', '20'),
        make('USDT', '30'),
        make('USDC', '40'),
      ];
      invoices.forEach((invoice) => store.insert(invoice));
      pay(invoices[0]!, Date.UTC(2026, 9, 10)); // October
      pay(invoices[1]!, Date.UTC(2026, 10, 3)); // November
      pay(invoices[2]!, Date.UTC(2026, 10, 4)); // November, another token
      pay(invoices[3]!, Date.UTC(2026, 10, 20)); // November

      expect(store.stats(NOW, 0).byMonth).toEqual([
        { month: '2026-11', symbol: 'USDC', decimals: 6, payments: 2, received: 60_000_000n },
        { month: '2026-11', symbol: 'USDT', decimals: 6, payments: 1, received: 30_000_000n },
        { month: '2026-10', symbol: 'USDC', decimals: 6, payments: 1, received: 10_000_000n },
      ]);
    });

    it('cuts months in the configured UTC offset', () => {
      const invoice = make('USDC', '10');
      store.insert(invoice);
      pay(invoice, Date.UTC(2026, 10, 1, 1, 0)); // 01:00 UTC on 1 Nov = 22:00 on 31 Oct in Brasilia

      expect(store.stats(NOW, 0).byMonth[0]?.month).toBe('2026-11');
      expect(store.stats(NOW, -180).byMonth[0]?.month).toBe('2026-10');
    });
  });
});
