// Entry point: node packages/server/dist/start.js (configuration comes from QUITADO_* variables).
import { ConfigError, loadConfig } from './config.ts';
import { startInstance } from './instance.ts';

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const instance = await startInstance(config);
console.log(
  `Quitado is running at ${config.baseUrl} ` +
    `(listening on ${config.host}:${instance.port}, ${config.cluster}, payments go to ${config.recipient})`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.log(`${signal} received, shutting down`);
    void instance.close().then(() => process.exit(0));
  });
}
