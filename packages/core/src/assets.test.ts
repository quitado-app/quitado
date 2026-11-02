import { describe, expect, it } from 'vitest';
import { AssetError, createAssetRegistry, mainnetRegistry } from './assets.ts';

const MINT_A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_B = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

describe('mainnet registry', () => {
  const registry = mainnetRegistry();

  it('has USDC and USDT with 6 decimals', () => {
    expect(registry.cluster).toBe('mainnet-beta');
    expect(registry.require('USDC')).toEqual({ symbol: 'USDC', mint: MINT_A, decimals: 6 });
    expect(registry.require('USDT')).toEqual({ symbol: 'USDT', mint: MINT_B, decimals: 6 });
    expect(registry.list().map((a) => a.symbol)).toEqual(['USDC', 'USDT']);
  });

  it('finds an asset by mint and rejects unknown ones', () => {
    expect(registry.findByMint(MINT_B)?.symbol).toBe('USDT');
    expect(registry.findByMint('11111111111111111111111111111111')).toBeUndefined();
    expect(registry.get('DAI')).toBeUndefined();
    expect(() => registry.require('DAI')).toThrow(AssetError);
  });

  it('returns frozen assets so callers cannot change a mint', () => {
    expect(Object.isFrozen(registry.require('USDC'))).toBe(true);
  });
});

describe('createAssetRegistry validation', () => {
  it('accepts a devnet test token', () => {
    const registry = createAssetRegistry('devnet', [{ symbol: 'TEST', mint: MINT_A, decimals: 6 }]);
    expect(registry.require('TEST').mint).toBe(MINT_A);
  });

  it.each([
    ['lowercase symbol', { symbol: 'usdc', mint: MINT_A, decimals: 6 }],
    ['bad mint', { symbol: 'USDC', mint: 'not-a-mint', decimals: 6 }],
    [
      'mint with ambiguous characters',
      { symbol: 'USDC', mint: MINT_A.replace('E', '0'), decimals: 6 },
    ],
    ['negative decimals', { symbol: 'USDC', mint: MINT_A, decimals: -1 }],
    ['fractional decimals', { symbol: 'USDC', mint: MINT_A, decimals: 1.5 }],
  ])('rejects %s', (_name, asset) => {
    expect(() => createAssetRegistry('devnet', [asset])).toThrow(AssetError);
  });

  it('rejects duplicate symbols and mints', () => {
    const a = { symbol: 'AAA', mint: MINT_A, decimals: 6 };
    expect(() => createAssetRegistry('devnet', [a, { ...a, mint: MINT_B }])).toThrow(
      /duplicate symbol/,
    );
    expect(() => createAssetRegistry('devnet', [a, { ...a, symbol: 'BBB' }])).toThrow(
      /duplicate mint/,
    );
  });
});
