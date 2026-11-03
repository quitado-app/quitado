// Consistent online backup of the SQLite database, safe to run while the app is running.
//
// The invoices (client names, descriptions) exist only in this database: payments can be found
// again on chain, invoices cannot. node:sqlite's backup() copies a consistent snapshot even
// while the app is writing, which a plain file copy of a WAL database cannot promise.
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

export class BackupError extends Error {
  override name = 'BackupError';
}

export interface BackupResult {
  destination: string;
  /** Database pages copied. */
  pages: number;
  /** Schema version of the copy, as recorded by the migrations. */
  schemaVersion: number;
}

export async function backupDatabase(source: string, destination: string): Promise<BackupResult> {
  const from = resolve(source);
  const to = resolve(destination);
  if (from === to)
    throw new BackupError('the destination must be a different file than the database');
  if (!existsSync(from)) throw new BackupError(`database not found: ${from}`);
  // Never overwrite: an older backup is worth more than a tidy directory.
  if (existsSync(to)) throw new BackupError(`destination already exists: ${to}`);
  mkdirSync(dirname(to), { recursive: true });

  const sourceDb = new DatabaseSync(from, { readOnly: true });
  let pages: number;
  try {
    pages = await backup(sourceDb, to);
  } finally {
    sourceDb.close();
  }
  // The copy holds client data: readable by its owner only (no effect on Windows).
  chmodSync(to, 0o600);

  // A backup nobody has opened is a hope, not a backup: check it.
  const copy = new DatabaseSync(to);
  try {
    // The live database is in WAL mode, which the copy inherits. Switch the copy to the plain
    // rollback journal so it is one self-contained file, with no -wal or -shm files next to it.
    copy.exec('pragma journal_mode = delete');
    const integrity = copy.prepare('pragma integrity_check').get();
    if (integrity?.['integrity_check'] !== 'ok') {
      throw new BackupError('the backup failed its integrity check');
    }
    const version = Number(copy.prepare('pragma user_version').get()?.['user_version'] ?? 0);
    return { destination: to, pages, schemaVersion: version };
  } finally {
    copy.close();
  }
}

/** "quitado-20261103-193105.db": sorts by time, and has no characters that need escaping. */
export function defaultBackupName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `quitado-${stamp}.db`;
}
