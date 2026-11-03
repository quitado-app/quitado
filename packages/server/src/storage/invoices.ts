import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { Invoice, InvoiceStatus, Payment } from '@quitado/core';
import { readStats, type InvoiceStats } from './stats.ts';

export type StorageErrorCode =
  | 'duplicate_id'
  | 'duplicate_reference'
  | 'duplicate_payment'
  | 'not_found'
  | 'already_paid'
  | 'underpaid'
  | 'invalid'
  | 'corrupt';

export class StorageError extends Error {
  override name = 'StorageError';
  constructor(
    readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ListOptions {
  status?: InvoiceStatus;
  /** 1 to 1000, default 100. */
  limit?: number;
  offset?: number;
}

export interface InvoiceStore {
  insert(invoice: Invoice): void;
  get(id: string): Invoice | undefined;
  getByReference(reference: string): Invoice | undefined;
  /** Newest first. */
  list(options?: ListOptions): Invoice[];
  /** Open invoices, oldest first: what the payment detection worker polls. */
  listOpen(): Invoice[];
  /**
   * Persists a settled invoice (the result of core's recordPayment) atomically: the status
   * change and the payment row succeed or fail together. Idempotent for the same signature.
   */
  settle(paid: Invoice): void;
  /** Usage numbers for the owner. `utcOffsetMinutes` decides where months start and end. */
  stats(now: number, utcOffsetMinutes: number): InvoiceStats;
}

type Row = Record<string, SQLOutputValue>;

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new StorageError('corrupt', `${key} is not text`);
  return value;
}

function integer(row: Row, key: string): bigint {
  const value = row[key];
  if (typeof value !== 'bigint') throw new StorageError('corrupt', `${key} is not an integer`);
  return value;
}

function timestamp(row: Row, key: string): number {
  const value = Number(integer(row, key));
  if (!Number.isSafeInteger(value)) throw new StorageError('corrupt', `${key} is out of range`);
  return value;
}

const SELECT_INVOICES = `
  select i.*, p.signature as pay_signature, p.amount as pay_amount,
         p.received_at as pay_received_at, p.payer as pay_payer
  from invoices i
  left join payments p on p.invoice_id = i.id
`;

function toInvoice(row: Row): Invoice {
  const status = text(row, 'status');
  if (status !== 'open' && status !== 'paid') throw new StorageError('corrupt', 'bad status');
  const invoice: Invoice = {
    id: text(row, 'id'),
    reference: text(row, 'reference'),
    clientName: text(row, 'client_name'),
    description: text(row, 'description'),
    asset: {
      symbol: text(row, 'asset_symbol'),
      mint: text(row, 'asset_mint'),
      decimals: Number(integer(row, 'asset_decimals')),
    },
    amount: integer(row, 'amount'),
    dueAt: timestamp(row, 'due_at'),
    createdAt: timestamp(row, 'created_at'),
    status,
  };
  if (row['pay_signature'] != null) {
    const payment: Payment = {
      signature: text(row, 'pay_signature'),
      amount: integer(row, 'pay_amount'),
      receivedAt: timestamp(row, 'pay_received_at'),
    };
    if (row['pay_payer'] != null) payment.payer = text(row, 'pay_payer');
    invoice.payment = payment;
  }
  if ((status === 'paid') !== (invoice.payment !== undefined)) {
    throw new StorageError('corrupt', `invoice ${invoice.id} status and payment disagree`);
  }
  return invoice;
}

/** Maps a SQLite unique violation to a StorageError, or returns the error unchanged. */
function mapConstraint(error: unknown): unknown {
  const message = error instanceof Error ? error.message : '';
  const match = /UNIQUE constraint failed: (\w+)\.(\w+)/.exec(message);
  if (!match) return error;
  const key = `${match[1]}.${match[2]}`;
  if (key === 'invoices.id') return new StorageError('duplicate_id', 'invoice id already exists');
  if (key === 'invoices.reference') {
    return new StorageError('duplicate_reference', 'invoice reference already exists');
  }
  if (key === 'payments.signature') {
    return new StorageError('duplicate_payment', 'transaction already settled another invoice');
  }
  return error;
}

function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('begin immediate');
  try {
    const result = work();
    db.exec('commit');
    return result;
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}

export function createInvoiceStore(db: DatabaseSync): InvoiceStore {
  // Integers are read as bigint so amounts never pass through a float.
  const readsBigInt = <T extends { setReadBigInts(enabled: boolean): void }>(statement: T): T => {
    statement.setReadBigInts(true);
    return statement;
  };

  const insertInvoice = db.prepare(`
    insert into invoices (id, reference, client_name, description, asset_symbol, asset_mint,
                          asset_decimals, amount, due_at, created_at, status)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `);
  const selectById = readsBigInt(db.prepare(`${SELECT_INVOICES} where i.id = ?`));
  const selectByReference = readsBigInt(db.prepare(`${SELECT_INVOICES} where i.reference = ?`));
  const selectAll = readsBigInt(
    db.prepare(`${SELECT_INVOICES} order by i.created_at desc, i.id limit ? offset ?`),
  );
  const selectByStatus = readsBigInt(
    db.prepare(
      `${SELECT_INVOICES} where i.status = ? order by i.created_at desc, i.id limit ? offset ?`,
    ),
  );
  const selectOpen = readsBigInt(
    db.prepare(`${SELECT_INVOICES} where i.status = 'open' order by i.created_at, i.id`),
  );
  const selectState = readsBigInt(
    db.prepare(`
      select i.amount as amount, i.status as status, p.signature as signature
      from invoices i left join payments p on p.invoice_id = i.id
      where i.id = ?
    `),
  );
  const markPaid = db.prepare(
    `update invoices set status = 'paid' where id = ? and status = 'open'`,
  );
  const insertPayment = db.prepare(
    'insert into payments (signature, invoice_id, amount, received_at, payer) values (?, ?, ?, ?, ?)',
  );

  return {
    insert(invoice) {
      if (invoice.status !== 'open' || invoice.payment) {
        throw new StorageError(
          'invalid',
          'only open invoices can be inserted; settle them afterwards',
        );
      }
      try {
        insertInvoice.run(
          invoice.id,
          invoice.reference,
          invoice.clientName,
          invoice.description,
          invoice.asset.symbol,
          invoice.asset.mint,
          BigInt(invoice.asset.decimals),
          invoice.amount,
          BigInt(invoice.dueAt),
          BigInt(invoice.createdAt),
        );
      } catch (error) {
        throw mapConstraint(error);
      }
    },

    get(id) {
      const row = selectById.get(id);
      return row ? toInvoice(row) : undefined;
    },

    getByReference(reference) {
      const row = selectByReference.get(reference);
      return row ? toInvoice(row) : undefined;
    },

    list({ status, limit = 100, offset = 0 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
        throw new StorageError('invalid', 'limit must be between 1 and 1000');
      }
      if (!Number.isInteger(offset) || offset < 0) {
        throw new StorageError('invalid', 'offset must be zero or more');
      }
      const rows =
        status === undefined
          ? selectAll.all(BigInt(limit), BigInt(offset))
          : selectByStatus.all(status, BigInt(limit), BigInt(offset));
      return rows.map(toInvoice);
    },

    listOpen() {
      return selectOpen.all().map(toInvoice);
    },

    stats(now, utcOffsetMinutes) {
      return readStats(db, now, utcOffsetMinutes);
    },

    settle(paid) {
      const payment = paid.payment;
      if (paid.status !== 'paid' || !payment) {
        throw new StorageError('invalid', 'settle expects a paid invoice with a payment');
      }
      inTransaction(db, () => {
        const state = selectState.get(paid.id);
        if (!state) throw new StorageError('not_found', `invoice ${paid.id} does not exist`);
        if (state['status'] === 'paid') {
          if (state['signature'] === payment.signature) return; // already settled by this transaction
          throw new StorageError(
            'already_paid',
            'invoice is already paid by a different transaction',
          );
        }
        // Defense in depth: core checks this too, but this is the invariant that protects money.
        if (payment.amount < integer(state, 'amount')) {
          throw new StorageError('underpaid', 'payment is smaller than the invoice amount');
        }
        markPaid.run(paid.id);
        try {
          insertPayment.run(
            payment.signature,
            paid.id,
            payment.amount,
            BigInt(payment.receivedAt),
            payment.payer ?? null,
          );
        } catch (error) {
          throw mapConstraint(error);
        }
      });
    },
  };
}
