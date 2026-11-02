// Creates throwaway devnet keys, funds the payer with SOL and creates a 6-decimals test token
// (a stand-in for USDC/USDT) with 1000 units minted to the payer and the merchant ATA ready.
import { getCreateAccountInstruction } from '@solana-program/system';
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { generateKeyPairSigner } from '@solana/kit';
import { loadOrCreateSigner, rpc, saveState, send } from './common.ts';

const DECIMALS = 6;

const merchant = await loadOrCreateSigner('merchant');
const payer = await loadOrCreateSigner('payer');
console.log('merchant:', merchant.address);
console.log('payer   :', payer.address);

// The public devnet RPC no longer serves requestAirdrop (HTTP 410): fund via https://faucet.solana.com.
const MIN_LAMPORTS = 50_000_000n; // 0.05 SOL covers the mint, two ATAs and every test transaction
const balance = (await rpc.getBalance(payer.address).send()).value;
console.log('payer SOL:', Number(balance) / 1e9);
if (balance < MIN_LAMPORTS) {
  throw new Error(
    `payer needs at least 0.05 devnet SOL: send some to ${payer.address} at https://faucet.solana.com`,
  );
}

const mint = await generateKeyPairSigner();
const space = BigInt(getMintSize());
const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
await send(payer, [
  getCreateAccountInstruction({
    payer,
    newAccount: mint,
    lamports: rent,
    space,
    programAddress: TOKEN_PROGRAM_ADDRESS,
  }),
  getInitializeMint2Instruction({
    mint: mint.address,
    decimals: DECIMALS,
    mintAuthority: payer.address,
  }),
]);
console.log('test mint:', mint.address);

const [payerAta] = await findAssociatedTokenPda({
  owner: payer.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
  mint: mint.address,
});
const [merchantAta] = await findAssociatedTokenPda({
  owner: merchant.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
  mint: mint.address,
});
await send(payer, [
  await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer,
    mint: mint.address,
    owner: payer.address,
  }),
  await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer,
    mint: mint.address,
    owner: merchant.address,
  }),
  getMintToCheckedInstruction({
    mint: mint.address,
    token: payerAta,
    mintAuthority: payer,
    amount: 1_000n * 10n ** BigInt(DECIMALS),
    decimals: DECIMALS,
  }),
]);

saveState({ mint: mint.address, decimals: DECIMALS, payerAta, merchantAta });
console.log('done. payer ATA:', payerAta, ' merchant ATA:', merchantAta);
