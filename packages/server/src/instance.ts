// Wires one Quitado instance together: database, payment worker and web server.
import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { createSolanaRpc } from '@solana/kit';
import { createAssetRegistry, mainnetRegistry } from '@quitado/core';
import type { Config } from './config.ts';
import {
  createKitChainReader,
  createPaymentWorker,
  type ChainReader,
  type PaymentWorker,
  type WorkerEvent,
} from './detection/index.ts';
import { createInvoiceStore, openDatabase, type InvoiceStore } from './storage/index.ts';
import { createWebServer } from './web/app.ts';
import { createAuth } from './web/auth.ts';

export interface Instance {
  server: Server;
  store: InvoiceStore;
  worker: PaymentWorker;
  /** The port actually bound (useful when the configured port is 0). */
  port: number;
  close(): Promise<void>;
}

export interface InstanceOptions {
  /** Replaces the Solana RPC reader; used by tests. */
  chain?: ChainReader;
  onWorkerEvent?: (event: WorkerEvent) => void;
  onError?: (error: unknown) => void;
}

/** One JSON object per line: easy to read, easy to ship to any log tool. Never includes secrets. */
function logLine(event: WorkerEvent): void {
  const { received, ...rest } = event as WorkerEvent & { received?: bigint };
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      ...rest,
      ...(received === undefined ? {} : { received: received.toString() }),
    }),
  );
}

export async function startInstance(
  config: Config,
  options: InstanceOptions = {},
): Promise<Instance> {
  if (config.dbPath !== ':memory:') mkdirSync(dirname(resolve(config.dbPath)), { recursive: true });
  const db = openDatabase(config.dbPath);
  const store = createInvoiceStore(db);

  const registry =
    config.cluster === 'devnet'
      ? createAssetRegistry('devnet', config.customAssets ?? [])
      : mainnetRegistry();

  const chain = options.chain ?? createKitChainReader(createSolanaRpc(config.rpcUrl));
  const worker = createPaymentWorker({
    store,
    chain,
    recipient: config.recipient,
    commitment: config.commitment,
    onEvent: options.onWorkerEvent ?? logLine,
  });

  const server = createWebServer({
    config,
    store,
    registry,
    auth: createAuth(config.accessSecret),
    onError: options.onError ?? ((error) => console.error('request failed:', error)),
  });

  try {
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => resolveListen());
    });
  } catch (error) {
    db.close();
    throw error;
  }
  worker.start(config.pollIntervalMs);

  return {
    server,
    store,
    worker,
    port: (server.address() as AddressInfo).port,
    async close() {
      await worker.stop();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      db.close();
    },
  };
}
