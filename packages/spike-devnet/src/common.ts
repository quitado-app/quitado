import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromPrivateKeyBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';

export const RPC_URL = 'https://api.devnet.solana.com';
export const WS_URL = 'wss://api.devnet.solana.com';

export const rpc = createSolanaRpc(RPC_URL);
export const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

// Throwaway devnet keys live outside src, in a git-ignored folder at the repo root.
const KEYS_DIR = join(import.meta.dirname, '..', '..', '..', '.keys');

export async function loadOrCreateSigner(name: string): Promise<KeyPairSigner> {
  mkdirSync(KEYS_DIR, { recursive: true });
  const file = join(KEYS_DIR, `${name}.json`);
  if (!existsSync(file)) {
    writeFileSync(file, JSON.stringify({ seedHex: randomBytes(32).toString('hex') }));
  }
  const { seedHex } = JSON.parse(readFileSync(file, 'utf8')) as { seedHex: string };
  return createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from(Buffer.from(seedHex, 'hex')));
}

export function loadState<T>(): T | undefined {
  const file = join(KEYS_DIR, 'state.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : undefined;
}

export function saveState(state: unknown): void {
  mkdirSync(KEYS_DIR, { recursive: true });
  writeFileSync(join(KEYS_DIR, 'state.json'), JSON.stringify(state, null, 2));
}

export async function send(
  feePayer: KeyPairSigner,
  instructions: readonly Instruction[],
  options: { skipPreflight?: boolean; allowFailure?: boolean } = {},
) {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  const signature = getSignatureFromTransaction(signed);
  try {
    await sendAndConfirm(signed, {
      commitment: 'confirmed',
      skipPreflight: options.skipPreflight ?? false,
    });
  } catch (error) {
    // With allowFailure the transaction is expected to land and fail on chain.
    if (!options.allowFailure) throw error;
  }
  return signature;
}

/** Creates a fresh SPL mint (payer is the mint authority) plus the payer and merchant ATAs. */
export async function createTestMint(
  payer: KeyPairSigner,
  merchant: KeyPairSigner,
  decimals: number,
  mintToPayer: bigint,
) {
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
    getInitializeMint2Instruction({ mint: mint.address, decimals, mintAuthority: payer.address }),
  ]);
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
      amount: mintToPayer,
      decimals,
    }),
  ]);
  return { mint: mint.address, decimals, payerAta, merchantAta };
}
