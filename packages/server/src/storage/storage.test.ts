import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInvoice, mainnetRegistry, recordPayment, type Invoice } from '@quitado/core';
import { createInvoiceStore, MIGRATIONS, migrate, openDatabase, StorageError } from './index.ts';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const registry = mainnetRegistry();

// Valid base58 references (32 to 44 chars from the base58 alphabet).
const REFERENCES = [
  'E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL',
  'FqzsbMrvNckrLJuEUD9Kuc6d5RMQNbHv5mb4TgdiX6tU',
  'CWEDDyZExHR2bUgqu6LFqcvGS6ZZWB5MYgetmNZMkJTw',
  '4w8N1R9KkufzffQMotUxdkzWdUguo44JM7ihRn7RL3DZ',
] as const;

function makeInvoice(n: number, overrides: { amount?: string; createdAt?: number } = {}): Invoice {
  return createInvoice(
    {
      id: `inv_${n}`,
      reference: REFERENCES[n]!,
      clientName: `Client ${n}`,
      description: `Work item ${n}`,
      assetSymbol: n % 2 === 0 ? 'USDC' : 'USDT',
      amount: overrides.amount ?? '100.50',
      dueAt: NOW + 7 * DAY,
    },
    registry,
    overrides.createdAt ?? NOW,
  );
}

const paymentFor = (
  invoice: Invoice,
  signature: string,
  extra: Partial<Invoice['payment'] & object> = {},
) => recordPayment(invoice, { signature, amount: invoice.amount, receivedAt: NOW + DAY, ...extra });

describe('migrations', () => {
  it('creates the schema and records the version', () => {
    const db = openDatabase(':memory:');
    expect(db.prepare('pragma user_version').get()).toEqual({ user_version: MIGRATIONS.length });
    expect(db.prepare('pragma foreign_keys').get()).toEqual({ foreign_keys: 1 });
    db.close();
  });

  it('is idempotent', () => {
    const db = openDatabase(':memory:');
    expect(() => migrate(db)).not.toThrow();
    db.close();
  });

  it('refuses a database written by a newer Quitado', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`pragma user_version = ${MIGRATIONS.length + 1}`);
    expect(() => migrate(db)).toThrow(/newer than this version/);
    db.close();
  });
});

describe('invoice store', () => {
  let db: DatabaseSync;
  let store: ReturnType<typeof createInvoiceStore>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = createInvoiceStore(db);
  });
  afterEach(() => db.close());

  it('round-trips an invoice exactly, including the largest allowed amount', () => {
    const invoice = makeInvoice(0, { amount: '999999999.999999' });
    store.insert(invoice);
    expect(store.get('inv_0')).toEqual(invoice);
    expect(store.get('inv_0')?.amount).toBe(999_999_999_999_999n);
    expect(store.getByReference(invoice.reference)).toEqual(invoice);
  });

  it('returns undefined for unknown ids and references', () => {
    expect(store.get('nope')).toBeUndefined();
    expect(store.getByReference(REFERENCES[3]!)).toBeUndefined();
  });

  it('rejects a duplicate id or reference', () => {
    store.insert(makeInvoice(0));
    // Each collision in isolation: when both collide, which constraint SQLite reports is its choice.
    const sameId = { ...makeInvoice(1), id: 'inv_0' };
    expect(() => store.insert(sameId)).toThrow(expect.objectContaining({ code: 'duplicate_id' }));
    const sameReference = { ...makeInvoice(1), reference: REFERENCES[0]! };
    expect(() => store.insert(sameReference)).toThrow(
      expect.objectContaining({ code: 'duplicate_reference' }),
    );
  });

  it('only inserts open invoices', () => {
    const paid = paymentFor(makeInvoice(0), 'sig');
    expect(() => store.insert(paid)).toThrow(expect.objectContaining({ code: 'invalid' }));
  });

  it('lists newest first, filters by status and paginates', () => {
    store.insert(makeInvoice(0, { createdAt: NOW }));
    store.insert(makeInvoice(1, { createdAt: NOW + 1 }));
    store.insert(makeInvoice(2, { createdAt: NOW + 2 }));
    store.settle(paymentFor(makeInvoice(1, { createdAt: NOW + 1 }), 'sig1'));

    expect(store.list().map((i) => i.id)).toEqual(['inv_2', 'inv_1', 'inv_0']);
    expect(store.list({ status: 'paid' }).map((i) => i.id)).toEqual(['inv_1']);
    expect(store.list({ status: 'open' }).map((i) => i.id)).toEqual(['inv_2', 'inv_0']);
    expect(store.list({ limit: 1, offset: 1 }).map((i) => i.id)).toEqual(['inv_1']);
    expect(store.listOpen().map((i) => i.id)).toEqual(['inv_0', 'inv_2']);
  });

  it('validates list bounds', () => {
    expect(() => store.list({ limit: 0 })).toThrow(StorageError);
    expect(() => store.list({ limit: 1001 })).toThrow(StorageError);
    expect(() => store.list({ offset: -1 })).toThrow(StorageError);
  });

  describe('settle', () => {
    it('stores the payment with the amount actually received', () => {
      const invoice = makeInvoice(0);
      store.insert(invoice);
      const paid = paymentFor(invoice, 'sig1', {
        amount: invoice.amount + 5n,
        payer: 'PayerWallet',
      });
      store.settle(paid);
      expect(store.get('inv_0')).toEqual(paid);
      expect(store.get('inv_0')?.payment?.amount).toBe(invoice.amount + 5n);
      expect(store.listOpen()).toEqual([]);
    });

    it('is idempotent for the same signature', () => {
      const invoice = makeInvoice(0);
      store.insert(invoice);
      const paid = paymentFor(invoice, 'sig1');
      store.settle(paid);
      expect(() => store.settle(paid)).not.toThrow();
      expect(store.get('inv_0')).toEqual(paid);
    });

    it('refuses a second, different transaction for a paid invoice', () => {
      const invoice = makeInvoice(0);
      store.insert(invoice);
      store.settle(paymentFor(invoice, 'sig1'));
      expect(() => store.settle(paymentFor(invoice, 'sig2'))).toThrow(
        expect.objectContaining({ code: 'already_paid' }),
      );
      expect(store.get('inv_0')?.payment?.signature).toBe('sig1');
    });

    it('lets one transaction settle only one invoice, and leaves the other open', () => {
      const first = makeInvoice(0);
      const second = makeInvoice(1);
      store.insert(first);
      store.insert(second);
      store.settle(paymentFor(first, 'shared-sig'));
      expect(() => store.settle(paymentFor(second, 'shared-sig'))).toThrow(
        expect.objectContaining({ code: 'duplicate_payment' }),
      );
      // The failed settle rolled back completely: the second invoice is still open.
      expect(store.get('inv_1')?.status).toBe('open');
      expect(store.get('inv_1')?.payment).toBeUndefined();
    });

    it('refuses an underpayment even if core was bypassed', () => {
      const invoice = makeInvoice(0);
      store.insert(invoice);
      const forged: Invoice = {
        ...invoice,
        status: 'paid',
        payment: { signature: 'sig1', amount: invoice.amount - 1n, receivedAt: NOW },
      };
      expect(() => store.settle(forged)).toThrow(expect.objectContaining({ code: 'underpaid' }));
      expect(store.get('inv_0')?.status).toBe('open');
    });

    it('rejects unknown invoices and invoices that are not paid', () => {
      const ghost = paymentFor(makeInvoice(0), 'sig1');
      expect(() => store.settle(ghost)).toThrow(expect.objectContaining({ code: 'not_found' }));
      expect(() => store.settle(makeInvoice(1))).toThrow(
        expect.objectContaining({ code: 'invalid' }),
      );
    });
  });
});

describe('file database', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'quitado-test-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('persists across reopen and uses WAL', () => {
    const file = join(dir, 'quitado.db');
    const invoice = makeInvoice(0);
    const paid = paymentFor(invoice, 'sig1');

    const first = openDatabase(file);
    expect(first.prepare('pragma journal_mode').get()).toEqual({ journal_mode: 'wal' });
    const firstStore = createInvoiceStore(first);
    firstStore.insert(invoice);
    firstStore.settle(paid);
    first.close();

    const second = openDatabase(file);
    expect(createInvoiceStore(second).get('inv_0')).toEqual(paid);
    second.close();
  });
});
