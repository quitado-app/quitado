// Usage numbers for the owner, computed from the instance's own database. Nothing here leaves the
// instance: there is no telemetry.
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

export interface AssetStats {
  symbol: string;
  decimals: number;
  /** Invoices issued in this token. */
  invoices: number;
  /** How many of them were paid. */
  paid: number;
  /** Sum of the invoiced amounts, in base units. */
  invoiced: bigint;
  /** Sum of what was actually received, in base units. */
  received: bigint;
}

export interface MonthStats {
  /** "YYYY-MM" in the instance's UTC offset. */
  month: string;
  symbol: string;
  decimals: number;
  payments: number;
  received: bigint;
}

export interface InvoiceStats {
  total: number;
  open: number;
  paid: number;
  /** Open and past their due date. */
  overdue: number;
  byAsset: AssetStats[];
  /** Newest month first. */
  byMonth: MonthStats[];
}

type Row = Record<string, SQLOutputValue>;

const count = (row: Row | undefined, key: string): number => Number(row?.[key] ?? 0);

function big(row: Row, key: string): bigint {
  const value = row[key];
  if (typeof value !== 'bigint') throw new Error(`stats: ${key} is not an integer`);
  return value;
}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`stats: ${key} is not text`);
  return value;
}

export function readStats(db: DatabaseSync, now: number, utcOffsetMinutes: number): InvoiceStats {
  const totals = db
    .prepare(
      `select count(*) as total,
              coalesce(sum(status = 'open'), 0) as open,
              coalesce(sum(status = 'paid'), 0) as paid,
              coalesce(sum(status = 'open' and due_at < ?), 0) as overdue
       from invoices`,
    )
    .get(BigInt(now));

  // Sums stay integers in SQLite and are read back as bigint: no float ever touches an amount.
  const assetStatement = db.prepare(
    `select i.asset_symbol as symbol, i.asset_decimals as decimals,
            count(*) as invoices,
            coalesce(sum(i.status = 'paid'), 0) as paid,
            coalesce(sum(i.amount), 0) as invoiced,
            coalesce(sum(p.amount), 0) as received
     from invoices i left join payments p on p.invoice_id = i.id
     group by i.asset_symbol, i.asset_decimals
     order by i.asset_symbol`,
  );
  assetStatement.setReadBigInts(true);
  const byAsset = assetStatement.all().map((row): AssetStats => ({
    symbol: text(row, 'symbol'),
    decimals: Number(big(row, 'decimals')),
    invoices: Number(big(row, 'invoices')),
    paid: Number(big(row, 'paid')),
    invoiced: big(row, 'invoiced'),
    received: big(row, 'received'),
  }));

  // Months are cut in JavaScript so they follow the configured UTC offset.
  const paymentStatement = db.prepare(
    `select p.received_at as received_at, p.amount as amount,
            i.asset_symbol as symbol, i.asset_decimals as decimals
     from payments p join invoices i on i.id = p.invoice_id`,
  );
  paymentStatement.setReadBigInts(true);
  const months = new Map<string, MonthStats>();
  for (const row of paymentStatement.all()) {
    const at = Number(big(row, 'received_at')) + utcOffsetMinutes * 60_000;
    const month = new Date(at).toISOString().slice(0, 7);
    const symbol = text(row, 'symbol');
    const key = `${month}|${symbol}`;
    const entry = months.get(key) ?? {
      month,
      symbol,
      decimals: Number(big(row, 'decimals')),
      payments: 0,
      received: 0n,
    };
    entry.payments += 1;
    entry.received += big(row, 'amount');
    months.set(key, entry);
  }
  const byMonth = [...months.values()].sort(
    (a, b) => b.month.localeCompare(a.month) || a.symbol.localeCompare(b.symbol),
  );

  return {
    total: count(totals, 'total'),
    open: count(totals, 'open'),
    paid: count(totals, 'paid'),
    overdue: count(totals, 'overdue'),
    byAsset,
    byMonth,
  };
}
