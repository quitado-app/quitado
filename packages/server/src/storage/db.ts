import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations.ts';

/** Opens (and migrates) the SQLite database. Use ":memory:" for tests. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  try {
    db.exec('pragma foreign_keys = on');
    db.exec('pragma busy_timeout = 5000');
    if (path !== ':memory:') db.exec('pragma journal_mode = wal');
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
