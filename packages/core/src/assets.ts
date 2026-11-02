// The stablecoins an instance accepts. Mints are plain base58 strings so core has no Solana
// dependency; the server adapter turns them into typed addresses.

export type Cluster = 'mainnet-beta' | 'devnet';

export interface Asset {
  symbol: string;
  mint: string;
  decimals: number;
}

export class AssetError extends Error {
  override name = 'AssetError';
}

export interface AssetRegistry {
  readonly cluster: Cluster;
  list(): readonly Asset[];
  get(symbol: string): Asset | undefined;
  require(symbol: string): Asset;
  findByMint(mint: string): Asset | undefined;
}

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function createAssetRegistry(cluster: Cluster, assets: readonly Asset[]): AssetRegistry {
  const bySymbol = new Map<string, Asset>();
  const byMint = new Map<string, Asset>();
  for (const asset of assets) {
    if (!/^[A-Z0-9]{2,10}$/.test(asset.symbol)) {
      throw new AssetError(`invalid symbol: ${JSON.stringify(asset.symbol)}`);
    }
    if (!BASE58_ADDRESS.test(asset.mint)) {
      throw new AssetError(`invalid mint for ${asset.symbol}`);
    }
    if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 18) {
      throw new AssetError(`invalid decimals for ${asset.symbol}`);
    }
    if (bySymbol.has(asset.symbol)) throw new AssetError(`duplicate symbol: ${asset.symbol}`);
    if (byMint.has(asset.mint)) throw new AssetError(`duplicate mint: ${asset.mint}`);
    const frozen = Object.freeze({ ...asset });
    bySymbol.set(asset.symbol, frozen);
    byMint.set(asset.mint, frozen);
  }
  return {
    cluster,
    list: () => [...bySymbol.values()],
    get: (symbol) => bySymbol.get(symbol),
    require: (symbol) => {
      const asset = bySymbol.get(symbol);
      if (!asset) throw new AssetError(`unsupported asset: ${symbol}`);
      return asset;
    },
    findByMint: (mint) => byMint.get(mint),
  };
}

/**
 * Mainnet stablecoins. Both mints were checked on chain (classic Token program, initialized,
 * 6 decimals); see docs/spike-devnet.md. Both have an issuer freeze authority.
 */
export const MAINNET_ASSETS: readonly Asset[] = [
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
];

export const mainnetRegistry = (): AssetRegistry =>
  createAssetRegistry('mainnet-beta', MAINNET_ASSETS);
