// Read-only check of the mainnet stablecoin mints listed in the project notes.
import { fetchMint } from '@solana-program/token';
import { address, createSolanaRpc } from '@solana/kit';

const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');

const MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

for (const [symbol, mintAddress] of Object.entries(MINTS)) {
  const mint = await fetchMint(rpc, address(mintAddress));
  const freeze = mint.data.freezeAuthority;
  console.log(
    `${symbol}: owner program=${mint.programAddress} decimals=${mint.data.decimals} ` +
      `initialized=${mint.data.isInitialized} supply=${mint.data.supply} ` +
      `freezeAuthority=${'__option' in freeze && freeze.__option === 'Some' ? freeze.value : 'none'}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
setTimeout(() => process.exit(), 100);
