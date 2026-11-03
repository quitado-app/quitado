import { describe, expect, it } from 'vitest';
import { ConfigError, configWarnings, loadConfig } from './config.ts';

const RECIPIENT = 'E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL';
const MINT = 'CWEDDyZExHR2bUgqu6LFqcvGS6ZZWB5MYgetmNZMkJTw';
const SECRET = 'a-long-enough-secret-value-1234';

const base = { QUITADO_RECIPIENT: RECIPIENT, QUITADO_ACCESS_SECRET: SECRET };

describe('loadConfig', () => {
  it('applies safe defaults on mainnet', () => {
    expect(loadConfig(base)).toEqual({
      cluster: 'mainnet-beta',
      recipient: RECIPIENT,
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      dbPath: './data/quitado.db',
      accessSecret: SECRET,
      baseUrl: 'http://localhost:3000',
      host: '127.0.0.1',
      port: 3000,
      ownerName: undefined,
      customAssets: undefined,
      pollIntervalMs: 10_000,
      commitment: 'finalized',
      utcOffsetMinutes: 0,
      trustProxy: false,
    });
  });

  it('reads every option', () => {
    const config = loadConfig({
      ...base,
      QUITADO_CLUSTER: 'devnet',
      QUITADO_ASSETS: `TEST:${MINT}:6`,
      QUITADO_RPC_URL: 'https://rpc.example.com/key',
      QUITADO_DB_PATH: '/data/q.db',
      QUITADO_BASE_URL: 'https://pay.example.com/',
      QUITADO_HOST: '0.0.0.0',
      QUITADO_PORT: '8080',
      QUITADO_OWNER_NAME: 'Davi',
      QUITADO_POLL_INTERVAL_SECONDS: '5',
      QUITADO_COMMITMENT: 'confirmed',
      QUITADO_UTC_OFFSET_MINUTES: '-180',
      QUITADO_TRUST_PROXY: 'true',
    });
    expect(config).toMatchObject({
      cluster: 'devnet',
      rpcUrl: 'https://rpc.example.com/key',
      dbPath: '/data/q.db',
      baseUrl: 'https://pay.example.com',
      host: '0.0.0.0',
      port: 8080,
      ownerName: 'Davi',
      pollIntervalMs: 5000,
      commitment: 'confirmed',
      utcOffsetMinutes: -180,
      trustProxy: true,
      customAssets: [{ symbol: 'TEST', mint: MINT, decimals: 6 }],
    });
  });

  it('uses the devnet RPC by default on devnet', () => {
    const config = loadConfig({
      ...base,
      QUITADO_CLUSTER: 'devnet',
      QUITADO_ASSETS: `TEST:${MINT}:6`,
    });
    expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
  });

  it('derives the default base URL from the port', () => {
    expect(loadConfig({ ...base, QUITADO_PORT: '4000' }).baseUrl).toBe('http://localhost:4000');
  });

  it('lists every problem at once', () => {
    const error = (() => {
      try {
        loadConfig({
          QUITADO_CLUSTER: 'testnet',
          QUITADO_PORT: 'abc',
          QUITADO_ACCESS_SECRET: 'short',
        });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as Error).message;
    expect(message).toMatch(/QUITADO_CLUSTER/);
    expect(message).toMatch(/QUITADO_RECIPIENT/);
    expect(message).toMatch(/QUITADO_ACCESS_SECRET/);
    expect(message).toMatch(/QUITADO_PORT/);
  });

  it('never prints the secret in an error', () => {
    expect(() =>
      loadConfig({ ...base, QUITADO_ACCESS_SECRET: 'tooshort', QUITADO_PORT: '0' }),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining('tooshort') }));
  });

  describe('https on mainnet', () => {
    it('refuses a public http address on mainnet, where real money and the sign-in would travel in clear text', () => {
      expect(() => loadConfig({ ...base, QUITADO_BASE_URL: 'http://pay.example.com' })).toThrow(
        /must use https on mainnet-beta/,
      );
      expect(() => loadConfig({ ...base, QUITADO_BASE_URL: 'http://203.0.113.7:3000' })).toThrow(
        /must use https on mainnet-beta/,
      );
    });

    it.each([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'https://pay.example.com',
    ])('accepts %s on mainnet', (url) => {
      expect(() => loadConfig({ ...base, QUITADO_BASE_URL: url })).not.toThrow();
    });

    it('does not apply to devnet, where no real money is involved', () => {
      expect(() =>
        loadConfig({
          ...base,
          QUITADO_CLUSTER: 'devnet',
          QUITADO_ASSETS: `TEST:${MINT}:6`,
          QUITADO_BASE_URL: 'http://pay.example.com',
        }),
      ).not.toThrow();
    });
  });

  describe('configWarnings', () => {
    const warningsFor = (extra: Record<string, string> = {}) =>
      configWarnings(loadConfig({ ...base, ...extra }));

    it('warns about the public RPC on mainnet, and stops once an RPC is set', () => {
      expect(warningsFor().join('\n')).toMatch(/QUITADO_RPC_URL is not set/);
      expect(warningsFor({ QUITADO_RPC_URL: 'https://rpc.example.com/key' })).toEqual([]);
    });

    it('warns about confirmed commitment on mainnet only', () => {
      const rpc = { QUITADO_RPC_URL: 'https://rpc.example.com/key' };
      expect(warningsFor({ ...rpc, QUITADO_COMMITMENT: 'confirmed' }).join('\n')).toMatch(
        /confirmed marks invoices paid before/,
      );
      expect(
        configWarnings(
          loadConfig({
            ...base,
            QUITADO_CLUSTER: 'devnet',
            QUITADO_ASSETS: `TEST:${MINT}:6`,
            QUITADO_COMMITMENT: 'confirmed',
          }),
        ),
      ).toEqual([]);
    });

    it('suggests QUITADO_TRUST_PROXY when the address is https but the proxy is not trusted', () => {
      const rpc = { QUITADO_RPC_URL: 'https://rpc.example.com/key' };
      const https = { ...rpc, QUITADO_BASE_URL: 'https://pay.example.com' };
      expect(warningsFor(https).join('\n')).toMatch(/QUITADO_TRUST_PROXY=true/);
      expect(warningsFor({ ...https, QUITADO_TRUST_PROXY: 'true' })).toEqual([]);
    });

    it('never mentions the secret', () => {
      expect(warningsFor().join('\n')).not.toContain(SECRET);
    });
  });

  it('refuses custom assets on mainnet, where phishing mints would be a risk', () => {
    expect(() => loadConfig({ ...base, QUITADO_ASSETS: `TEST:${MINT}:6` })).toThrow(
      /only allowed on devnet/,
    );
  });

  it('requires assets on devnet and a valid format', () => {
    expect(() => loadConfig({ ...base, QUITADO_CLUSTER: 'devnet' })).toThrow(
      /QUITADO_ASSETS is required/,
    );
    expect(() =>
      loadConfig({ ...base, QUITADO_CLUSTER: 'devnet', QUITADO_ASSETS: 'TEST:onlytwo' }),
    ).toThrow(/SYMBOL:mint:decimals/);
  });

  it.each([
    ['QUITADO_BASE_URL', 'ftp://x.com'],
    ['QUITADO_BASE_URL', 'https://x.com/path'],
    ['QUITADO_RPC_URL', 'not a url'],
    ['QUITADO_RECIPIENT', 'nope'],
    ['QUITADO_PORT', '70000'],
    ['QUITADO_POLL_INTERVAL_SECONDS', '1'],
    ['QUITADO_COMMITMENT', 'processed'],
    ['QUITADO_UTC_OFFSET_MINUTES', '999'],
    ['QUITADO_TRUST_PROXY', 'yes'],
    ['QUITADO_OWNER_NAME', 'x'.repeat(101)],
  ])('rejects %s=%s', (key, value) => {
    expect(() => loadConfig({ ...base, [key]: value })).toThrow(ConfigError);
  });
});
