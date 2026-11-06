import { afterEach, describe, expect, it } from 'vitest';
import { createInvoice, mainnetRegistry } from '@quitado/core';
import type { Config } from './config.ts';
import { FakeChain, PAYER, paymentTx, RECIPIENT } from './detection/test-utils.ts';
import type { WorkerEvent } from './detection/index.ts';
import { startInstance, type Instance } from './instance.ts';

const REFERENCE = '4w8N1R9KkufzffQMotUxdkzWdUguo44JM7ihRn7RL3DZ';

const config = (overrides: Partial<Config> = {}): Config => ({
  cluster: 'mainnet-beta',
  recipient: RECIPIENT,
  rpcUrl: 'http://127.0.0.1:1', // never used: tests inject a fake chain
  dbPath: ':memory:',
  accessSecret: 'a-long-enough-secret-value-1234',
  baseUrl: 'http://localhost:3000',
  host: '127.0.0.1',
  port: 0,
  ownerName: undefined,
  customAssets: undefined,
  pollIntervalMs: 20,
  commitment: 'confirmed',
  utcOffsetMinutes: 0,
  trustProxy: false,
  siteHost: undefined,
  ...overrides,
});

describe('startInstance', () => {
  let instance: Instance | undefined;
  afterEach(async () => {
    await instance?.close();
    instance = undefined;
  });

  async function until(check: () => Promise<boolean>, ms = 3000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (await check()) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  }

  it('serves pages and settles an invoice when its payment appears on the chain', async () => {
    const chain = new FakeChain();
    const events: WorkerEvent[] = [];
    instance = await startInstance(config(), { chain, onWorkerEvent: (e) => events.push(e) });

    const invoice = createInvoice(
      {
        id: 'inv_wired_aaaaaaaaaaaa',
        reference: REFERENCE,
        clientName: 'Acme',
        description: 'Work',
        assetSymbol: 'USDC',
        amount: '10',
        dueAt: Date.now() + 86_400_000,
      },
      mainnetRegistry(),
      Date.now(),
    );
    instance.store.insert(invoice);

    const base = `http://127.0.0.1:${instance.port}`;
    const status = async () =>
      (await (await fetch(`${base}/api/pay/${invoice.id}/status`)).json()) as { paid: boolean };

    expect((await fetch(`${base}/pay/${invoice.id}`)).status).toBe(200);
    expect(await status()).toMatchObject({ paid: false });

    // The customer pays: a transaction citing the reference appears on the chain.
    chain.add(
      REFERENCE,
      paymentTx('wired-sig', 10_000_000n, {
        accountKeys: [PAYER, 'payer-ata', 'recipient-ata', RECIPIENT, REFERENCE],
      }),
    );

    expect(await until(async () => (await status()).paid)).toBe(true);
    const page = await (await fetch(`${base}/pay/${invoice.id}`)).text();
    expect(page).toContain('Invoice paid');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'settled', invoiceId: invoice.id, signature: 'wired-sig' }),
    );
  });

  it('shuts down cleanly and stops polling', async () => {
    const chain = new FakeChain();
    instance = await startInstance(config(), { chain });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await instance.close();
    const callsAtClose = chain.calls.signatures;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(chain.calls.signatures).toBe(callsAtClose);
    instance = undefined;
  });

  it('fails clearly when the port is already taken', async () => {
    instance = await startInstance(config(), { chain: new FakeChain() });
    await expect(
      startInstance(config({ port: instance.port }), { chain: new FakeChain() }),
    ).rejects.toThrow(/EADDRINUSE/);
  });
});
