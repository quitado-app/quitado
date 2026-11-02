// End-to-end check against the real devnet. Skipped unless QUITADO_DEVNET=1.
//
//   QUITADO_DEVNET=1 npx vitest run packages/server/src/detection/devnet.e2e.test.ts
//
// Needs the throwaway keys and test token created by packages/spike-devnet (`node src/setup.ts`)
// in the git-ignored .keys/ folder, and the payer funded with devnet SOL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAddMemoInstruction } from '@solana-program/memo';
import { getTransferCheckedInstruction } from '@solana-program/token';
import {
  AccountRole,
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
  type Address,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAssetRegistry, createInvoice } from '@quitado/core';
import { createInvoiceStore, openDatabase } from '../storage/index.ts';
import { createKitChainReader } from './chain.ts';
import { createPaymentWorker } from './worker.ts';

const KEYS = join(import.meta.dirname, '..', '..', '..', '..', '.keys');
const enabled = process.env['QUITADO_DEVNET'] === '1';

interface State {
  mint: Address;
  decimals: number;
  payerAta: Address;
  merchantAta: Address;
}

const signerFrom = async (name: string) => {
  const { seedHex } = JSON.parse(readFileSync(join(KEYS, `${name}.json`), 'utf8')) as {
    seedHex: string;
  };
  return createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from(Buffer.from(seedHex, 'hex')));
};

describe.skipIf(!enabled)('payment detection on devnet', () => {
  const rpc = createSolanaRpc('https://api.devnet.solana.com');
  const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.devnet.solana.com');
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  const chain = createKitChainReader(rpc);

  let state: State;
  let payer: KeyPairSigner;
  let merchant: KeyPairSigner;
  const db = openDatabase(':memory:');
  const store = createInvoiceStore(db);

  beforeAll(async () => {
    state = JSON.parse(readFileSync(join(KEYS, 'state.json'), 'utf8')) as State;
    payer = await signerFrom('payer');
    merchant = await signerFrom('merchant');
  });
  afterAll(() => db.close());

  const registry = () =>
    createAssetRegistry('devnet', [{ symbol: 'TEST', mint: state.mint, decimals: state.decimals }]);

  async function send(instructions: Instruction[], skipPreflight = false) {
    const { value: blockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    try {
      await sendAndConfirm(signed, { commitment: 'confirmed', skipPreflight });
    } catch (error) {
      if (!skipPreflight) throw error; // a deliberately failing transaction is expected to throw
    }
    return getSignatureFromTransaction(signed);
  }

  /** A transferChecked of `base` units that cites `reference`, like a Solana Pay wallet. */
  function transfer(base: bigint, reference: Address): Instruction {
    const ix = getTransferCheckedInstruction({
      source: state.payerAta,
      mint: state.mint,
      destination: state.merchantAta,
      authority: payer,
      amount: base,
      decimals: state.decimals,
    });
    return {
      ...ix,
      accounts: [...ix.accounts, { address: reference, role: AccountRole.READONLY }],
    };
  }

  async function newInvoice(amount: string) {
    const reference = (await generateKeyPairSigner()).address;
    const invoice = createInvoice(
      {
        id: `e2e_${reference.slice(0, 8)}`,
        reference,
        clientName: 'Devnet client',
        description: 'End-to-end test',
        assetSymbol: 'TEST',
        amount,
        dueAt: Date.now() + 86_400_000,
      },
      registry(),
      Date.now(),
    );
    store.insert(invoice);
    return invoice;
  }

  /** Polls like the real worker would, until the invoice is paid or the deadline passes. */
  async function pollUntil(id: string, ms: number) {
    // 'confirmed' keeps the test fast; production defaults to 'finalized'.
    const worker = createPaymentWorker({
      store,
      chain,
      recipient: merchant.address,
      commitment: 'confirmed',
      onEvent: (event) => {
        if (event.type === 'error') console.log('worker error:', event.message);
      },
    });
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      await worker.pollOnce();
      if (store.get(id)?.status === 'paid') return;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  it('settles an invoice paid exactly', { timeout: 120_000 }, async () => {
    const invoice = await newInvoice('3');
    const signature = await send([transfer(3_000_000n, invoice.reference as Address)]);
    await pollUntil(invoice.id, 60_000);
    const paid = store.get(invoice.id);
    expect(paid?.status).toBe('paid');
    expect(paid?.payment?.signature).toBe(signature);
    expect(paid?.payment?.amount).toBe(3_000_000n);
    expect(paid?.payment?.payer).toBe(payer.address);
  });

  it(
    'settles when the wallet appends an instruction after the transfer',
    { timeout: 120_000 },
    async () => {
      const invoice = await newInvoice('2');
      // @solana/pay validateTransfer rejects this transaction ("transfer must be the last instruction").
      const signature = await send([
        transfer(2_000_000n, invoice.reference as Address),
        getAddMemoInstruction({ memo: 'appended after the transfer', signers: [payer] }),
      ]);
      await pollUntil(invoice.id, 60_000);
      expect(store.get(invoice.id)?.payment?.signature).toBe(signature);
    },
  );

  it(
    'is not fooled by a failed transaction that cites the reference first',
    { timeout: 120_000 },
    async () => {
      const invoice = await newInvoice('1');
      const failed = await send([transfer(10_000_000_000n, invoice.reference as Address)], true);
      const real = await send([transfer(1_000_000n, invoice.reference as Address)]);
      await pollUntil(invoice.id, 60_000);
      expect(store.get(invoice.id)?.payment?.signature).toBe(real);
      expect(real).not.toBe(failed);
    },
  );

  it('does not settle an underpaid invoice', { timeout: 120_000 }, async () => {
    const invoice = await newInvoice('5');
    await send([transfer(4_990_000n, invoice.reference as Address)]);
    await pollUntil(invoice.id, 25_000);
    expect(store.get(invoice.id)?.status).toBe('open');
  });
});
