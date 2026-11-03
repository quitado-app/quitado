import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInvoice, mainnetRegistry, recordPayment } from '@quitado/core';
import { BackupError, backupDatabase, defaultBackupName } from './backup.ts';
import { createInvoiceStore, MIGRATIONS, openDatabase } from './storage/index.ts';
import { newReference } from './web/ids.ts';

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

describe('backupDatabase', () => {
  let dir: string;
  let source: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'quitado-backup-'));
    source = join(dir, 'quitado.db');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const invoice = (n: number) =>
    createInvoice(
      {
        id: `inv_${n}`,
        reference: newReference(),
        clientName: `Client ${n}`,
        description: 'Work',
        assetSymbol: 'USDC',
        amount: '10',
        dueAt: NOW + 86_400_000,
      },
      mainnetRegistry(),
      NOW,
    );

  it('copies a consistent snapshot while the app still has the database open and writing', async () => {
    const db = openDatabase(source); // the "running app": connection stays open, WAL mode
    const store = createInvoiceStore(db);
    const first = invoice(1);
    store.insert(first);
    store.settle(
      recordPayment(first, { signature: 'sig1', amount: first.amount, receivedAt: NOW }),
    );
    store.insert(invoice(2));

    const result = await backupDatabase(source, join(dir, 'out', 'copy.db'));

    // The app keeps working after the backup.
    store.insert(invoice(3));
    expect(store.list()).toHaveLength(3);

    const copyDb = openDatabase(result.destination);
    const copy = createInvoiceStore(copyDb);
    expect(
      copy
        .list()
        .map((i) => i.id)
        .sort(),
    ).toEqual(['inv_1', 'inv_2']); // snapshot at backup time
    expect(copy.get('inv_1')?.status).toBe('paid');
    expect(copy.get('inv_1')?.payment?.signature).toBe('sig1');
    expect(result.schemaVersion).toBe(MIGRATIONS.length);
    expect(result.pages).toBeGreaterThan(0);
    copyDb.close();
    db.close();
  });

  it('produces one self-contained file, with no -wal or -shm files beside it', async () => {
    openDatabase(source).close();
    const destination = join(dir, 'copy.db');
    await backupDatabase(source, destination);
    expect(existsSync(destination)).toBe(true);
    expect(existsSync(`${destination}-wal`)).toBe(false);
    expect(existsSync(`${destination}-shm`)).toBe(false);
  });

  it('creates the destination folder', async () => {
    openDatabase(source).close();
    const destination = join(dir, 'a', 'b', 'c.db');
    await backupDatabase(source, destination);
    expect(existsSync(destination)).toBe(true);
  });

  it('never overwrites an existing backup', async () => {
    openDatabase(source).close();
    const destination = join(dir, 'copy.db');
    await backupDatabase(source, destination);
    await expect(backupDatabase(source, destination)).rejects.toThrow(/already exists/);
  });

  it('refuses to back up onto the database itself', async () => {
    openDatabase(source).close();
    await expect(backupDatabase(source, source)).rejects.toThrow(BackupError);
  });

  it('fails clearly when the database does not exist, and does not create one', async () => {
    const missing = join(dir, 'missing.db');
    await expect(backupDatabase(missing, join(dir, 'copy.db'))).rejects.toThrow(/not found/);
    expect(existsSync(missing)).toBe(false);
    expect(existsSync(join(dir, 'copy.db'))).toBe(false);
  });

  it('opens the source read-only: a backup can never change the live database', async () => {
    const db = openDatabase(source);
    const store = createInvoiceStore(db);
    store.insert(invoice(1));
    const before = store.get('inv_1');
    await backupDatabase(source, join(dir, 'copy.db'));
    expect(store.get('inv_1')).toEqual(before);
    db.close();
  });
});

describe('defaultBackupName', () => {
  it('is sortable, in UTC, and safe as a file name', () => {
    expect(defaultBackupName(new Date(Date.UTC(2026, 10, 3, 19, 31, 5)))).toBe(
      'quitado-20261103-193105.db',
    );
    expect(defaultBackupName(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe(
      'quitado-20260102-030405.db',
    );
  });
});
