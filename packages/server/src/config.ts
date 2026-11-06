// Instance configuration, read once from environment variables and validated up front so a
// misconfigured instance fails at startup with every problem listed, not later at the first request.
import type { Asset, Cluster } from '@quitado/core';
import type { Commitment } from './detection/index.ts';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export interface Config {
  cluster: Cluster;
  /** Wallet that receives every payment. Public information. */
  recipient: string;
  rpcUrl: string;
  dbPath: string;
  /** Secret the owner types to sign in. Never logged. */
  accessSecret: string;
  /** Public URL of this instance, without a trailing slash. Used for links and origin checks. */
  baseUrl: string;
  host: string;
  port: number;
  /** Shown as "From" on invoices. */
  ownerName: string | undefined;
  /** Required on devnet, forbidden on mainnet-beta (where the real USDC/USDT are built in). */
  customAssets: Asset[] | undefined;
  pollIntervalMs: number;
  commitment: Commitment;
  /** Offset used to turn a due date into the end of that day. 0 = UTC; Brazil is -180. */
  utcOffsetMinutes: number;
  /**
   * Read the client IP from X-Forwarded-For. Only enable behind a reverse proxy you control:
   * otherwise anyone can spoof their IP and dodge the rate limits.
   */
  trustProxy: boolean;
  /**
   * Optional host name (no scheme, no port) that shows the project's home page at "/" instead of
   * the owner's sign-in. Every other path on that host is sent to baseUrl. Left out on most
   * instances: it is for a project or company site that shares this server.
   */
  siteHost: string | undefined;
}

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function baseHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
const MIN_SECRET_LENGTH = 20;

export function loadConfig(env: Record<string, string | undefined>): Config {
  const problems: string[] = [];
  const get = (key: string) => {
    const value = env[key]?.trim();
    return value ? value : undefined;
  };
  const integer = (key: string, fallback: number, min: number, max: number): number => {
    const raw = get(key);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(`${key} must be an integer between ${min} and ${max}`);
      return fallback;
    }
    return value;
  };

  const clusterRaw = get('QUITADO_CLUSTER') ?? 'mainnet-beta';
  let cluster: Cluster = 'mainnet-beta';
  if (clusterRaw === 'mainnet-beta' || clusterRaw === 'devnet') cluster = clusterRaw;
  else problems.push('QUITADO_CLUSTER must be "mainnet-beta" or "devnet"');

  const recipient = get('QUITADO_RECIPIENT') ?? '';
  if (!BASE58_ADDRESS.test(recipient)) {
    problems.push('QUITADO_RECIPIENT must be the Solana wallet address that receives payments');
  }

  const accessSecret = get('QUITADO_ACCESS_SECRET') ?? '';
  if (accessSecret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `QUITADO_ACCESS_SECRET is required and must have at least ${MIN_SECRET_LENGTH} characters ` +
        "(generate one with: node -e \"console.log(require('node:crypto').randomBytes(24).toString('base64url'))\")",
    );
  }

  // Hosting platforms (Railway, Heroku, Render...) tell the app its port through PORT.
  const port = integer(get('QUITADO_PORT') === undefined ? 'PORT' : 'QUITADO_PORT', 3000, 1, 65535);
  const host = get('QUITADO_HOST') ?? '127.0.0.1';

  const baseUrlRaw = get('QUITADO_BASE_URL') ?? `http://localhost:${port}`;
  let baseUrl = baseUrlRaw.replace(/\/+$/, '');
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('path');
    baseUrl = parsed.origin;
    // Real money: the payment link, the owner's sign-in and its cookie must never travel in clear
    // text. Plain http is accepted only for trying the app on your own machine.
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (cluster === 'mainnet-beta' && parsed.protocol === 'http:' && !local) {
      problems.push(
        'QUITADO_BASE_URL must use https on mainnet-beta (http is only allowed for localhost): ' +
          'put a reverse proxy with TLS in front of the app',
      );
    }
  } catch {
    problems.push(
      'QUITADO_BASE_URL must be an http(s) URL without a path, e.g. https://pay.example.com',
    );
  }

  const rpcUrl =
    get('QUITADO_RPC_URL') ??
    (cluster === 'devnet'
      ? 'https://api.devnet.solana.com'
      : 'https://api.mainnet-beta.solana.com');
  try {
    const parsed = new URL(rpcUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
  } catch {
    problems.push('QUITADO_RPC_URL must be an http(s) URL');
  }

  const ownerName = get('QUITADO_OWNER_NAME');
  if (ownerName !== undefined && ownerName.length > 100) {
    problems.push('QUITADO_OWNER_NAME must have at most 100 characters');
  }

  const siteHostRaw = get('QUITADO_SITE_HOST')?.toLowerCase();
  let siteHost: string | undefined;
  if (siteHostRaw !== undefined) {
    if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(siteHostRaw)) {
      problems.push('QUITADO_SITE_HOST must be a host name only, e.g. example.com (no https://)');
    } else if (siteHostRaw === baseHostname(baseUrl)) {
      problems.push('QUITADO_SITE_HOST must differ from the host of QUITADO_BASE_URL');
    } else {
      siteHost = siteHostRaw;
    }
  }

  let customAssets: Asset[] | undefined;
  const assetsRaw = get('QUITADO_ASSETS');
  if (assetsRaw !== undefined) {
    if (cluster !== 'devnet') {
      problems.push(
        'QUITADO_ASSETS is only allowed on devnet: mainnet-beta uses the built-in USDC and USDT',
      );
    } else {
      customAssets = [];
      for (const entry of assetsRaw.split(',')) {
        const [symbol, mint, decimals, ...extra] = entry.trim().split(':');
        const places = Number(decimals);
        if (!symbol || !mint || extra.length > 0 || !Number.isInteger(places)) {
          problems.push(
            'QUITADO_ASSETS entries must look like SYMBOL:mint:decimals, comma separated',
          );
          break;
        }
        customAssets.push({ symbol, mint, decimals: places });
      }
    }
  } else if (cluster === 'devnet') {
    problems.push('QUITADO_ASSETS is required on devnet, e.g. TEST:<mint>:6');
  }

  const commitmentRaw = get('QUITADO_COMMITMENT') ?? 'finalized';
  let commitment: Commitment = 'finalized';
  if (commitmentRaw === 'confirmed' || commitmentRaw === 'finalized') commitment = commitmentRaw;
  else problems.push('QUITADO_COMMITMENT must be "confirmed" or "finalized"');

  const trustProxyRaw = get('QUITADO_TRUST_PROXY') ?? 'false';
  if (trustProxyRaw !== 'true' && trustProxyRaw !== 'false') {
    problems.push('QUITADO_TRUST_PROXY must be "true" or "false"');
  }

  const pollSeconds = integer('QUITADO_POLL_INTERVAL_SECONDS', 10, 2, 3600);
  const utcOffsetMinutes = integer('QUITADO_UTC_OFFSET_MINUTES', 0, -720, 840);

  if (problems.length > 0) {
    throw new ConfigError(`invalid configuration:\n- ${problems.join('\n- ')}`);
  }

  return {
    cluster,
    recipient,
    rpcUrl,
    dbPath: get('QUITADO_DB_PATH') ?? './data/quitado.db',
    accessSecret,
    baseUrl,
    host,
    port,
    ownerName,
    customAssets,
    pollIntervalMs: pollSeconds * 1000,
    commitment,
    utcOffsetMinutes,
    trustProxy: trustProxyRaw === 'true',
    siteHost,
  };
}

/**
 * Settings that are valid but probably not what you want on a real instance. They are printed at
 * startup instead of refusing to start, because each one has legitimate uses.
 */
export function configWarnings(config: Config): string[] {
  const warnings: string[] = [];
  if (config.cluster === 'mainnet-beta') {
    if (config.rpcUrl === 'https://api.mainnet-beta.solana.com') {
      warnings.push(
        'QUITADO_RPC_URL is not set: the public Solana RPC is rate limited and not meant for ' +
          'production, so payments may be detected late or not at all. Use a dedicated RPC provider.',
      );
    }
    if (config.commitment === 'confirmed') {
      warnings.push(
        'QUITADO_COMMITMENT=confirmed marks invoices paid before the transaction is final. ' +
          'finalized is slower by a few seconds but cannot be rolled back.',
      );
    }
  }
  if (config.baseUrl.startsWith('https://') && !config.trustProxy) {
    warnings.push(
      'QUITADO_BASE_URL is https, so a reverse proxy probably terminates TLS in front of this ' +
        'app. If so, set QUITADO_TRUST_PROXY=true: otherwise every visitor looks like the proxy ' +
        'and they all share one rate limit.',
    );
  }
  return warnings;
}
