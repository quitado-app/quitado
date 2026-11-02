import type { DatabaseSync } from 'node:sqlite';

// Append-only: entry i is migration version i + 1. Never edit a released migration, add a new one.
// All integers are SQLite INTEGER (64-bit), which holds every base-unit amount core allows.
export const MIGRATIONS: readonly string[] = [
  `
  create table invoices (
    id text primary key,
    reference text not null unique,
    client_name text not null,
    description text not null,
    asset_symbol text not null,
    asset_mint text not null,
    asset_decimals integer not null,
    amount integer not null check (amount > 0),
    due_at integer not null,
    created_at integer not null,
    status text not null check (status in ('open', 'paid'))
  ) strict;

  create index invoices_status_due_at on invoices (status, due_at);
  create index invoices_created_at on invoices (created_at);

  -- One payment per invoice, and one transaction can settle only one invoice.
  create table payments (
    signature text primary key,
    invoice_id text not null unique references invoices (id),
    amount integer not null check (amount > 0),
    received_at integer not null,
    payer text
  ) strict;
  `,
];

export function migrate(db: DatabaseSync): void {
  const row = db.prepare('pragma user_version').get();
  const current = Number(row?.['user_version'] ?? 0);
  if (current > MIGRATIONS.length) {
    throw new Error(
      `database schema v${current} is newer than this version of Quitado (v${MIGRATIONS.length}): upgrade Quitado`,
    );
  }
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('begin immediate');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`pragma user_version = ${version + 1}`);
      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
      throw error;
    }
  }
}
