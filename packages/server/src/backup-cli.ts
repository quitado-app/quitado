// Usage: node packages/server/dist/backup-cli.js [destination]
//
// Reads QUITADO_DB_PATH like the app does. Without a destination it writes
// <database folder>/backups/quitado-<UTC time>.db.
import { dirname, join } from 'node:path';
import { BackupError, backupDatabase, defaultBackupName } from './backup.ts';

const source = process.env['QUITADO_DB_PATH'] ?? './data/quitado.db';
const destination =
  process.argv[2] ?? join(dirname(source), 'backups', defaultBackupName(new Date()));

try {
  const result = await backupDatabase(source, destination);
  console.log(
    `backup written to ${result.destination} (${result.pages} pages, schema v${result.schemaVersion}, integrity ok)`,
  );
} catch (error) {
  if (error instanceof BackupError) {
    console.error(`backup failed: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
