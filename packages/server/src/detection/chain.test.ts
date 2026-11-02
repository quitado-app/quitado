import { describe, expect, it } from 'vitest';
import type { GetSignaturesForAddressApi, GetTransactionApi, Rpc } from '@solana/kit';
import { createKitChainReader } from './chain.ts';
import { MINT, PAYER, RECIPIENT, REFERENCE } from './test-utils.ts';

// A well-formed base58 signature (88 chars). The adapter validates its shape.
const SIGNATURE =
  '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

type Call = { method: string; args: unknown[] };

/** A stand-in for the kit RPC: records calls and answers with kit-shaped data (bigint, Address). */
function fakeRpc(responses: { signatures?: unknown; transaction?: unknown }) {
  const calls: Call[] = [];
  const rpc = {
    getSignaturesForAddress: (...args: unknown[]) => {
      calls.push({ method: 'getSignaturesForAddress', args });
      return { send: async () => responses.signatures };
    },
    getTransaction: (...args: unknown[]) => {
      calls.push({ method: 'getTransaction', args });
      return { send: async () => responses.transaction };
    },
  } as unknown as Rpc<GetSignaturesForAddressApi & GetTransactionApi>;
  return { rpc, calls };
}

const tokenBalance = (accountIndex: number, owner: string, amount: string) => ({
  accountIndex,
  mint: MINT,
  owner,
  programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  uiTokenAmount: { amount, decimals: 6, uiAmount: null, uiAmountString: '' },
});

describe('createKitChainReader', () => {
  it('lists signatures, passing commitment, limit and before through', async () => {
    const { rpc, calls } = fakeRpc({
      signatures: [
        { signature: SIGNATURE, err: null, slot: 1n, blockTime: 1n, memo: null },
        {
          signature: SIGNATURE,
          err: { InstructionError: [0, 'x'] },
          slot: 2n,
          blockTime: 2n,
          memo: null,
        },
      ],
    });
    const chain = createKitChainReader(rpc);

    const infos = await chain.getSignaturesForAddress(REFERENCE, {
      limit: 50,
      before: SIGNATURE,
      commitment: 'finalized',
    });

    expect(infos).toEqual([
      { signature: SIGNATURE, err: null },
      { signature: SIGNATURE, err: { InstructionError: [0, 'x'] } },
    ]);
    expect(calls[0]?.args).toEqual([
      REFERENCE,
      { limit: 50, commitment: 'finalized', before: SIGNATURE },
    ]);
  });

  it('omits `before` on the first page', async () => {
    const { rpc, calls } = fakeRpc({ signatures: [] });
    await createKitChainReader(rpc).getSignaturesForAddress(REFERENCE, {
      limit: 100,
      commitment: 'confirmed',
    });
    expect(calls[0]?.args[1]).toEqual({ limit: 100, commitment: 'confirmed' });
  });

  it('converts a parsed transaction into plain types', async () => {
    const { rpc, calls } = fakeRpc({
      transaction: {
        blockTime: 1_800_000_100n,
        meta: {
          err: null,
          preTokenBalances: [
            tokenBalance(1, PAYER, '50000000'),
            tokenBalance(2, RECIPIENT, '7000000'),
          ],
          postTokenBalances: [
            tokenBalance(1, PAYER, '40000000'),
            tokenBalance(2, RECIPIENT, '17000000'),
          ],
        },
        transaction: {
          message: {
            accountKeys: [
              { pubkey: PAYER, signer: true, source: 'transaction', writable: true },
              { pubkey: REFERENCE, signer: false, source: 'lookupTable', writable: false },
            ],
          },
        },
      },
    });

    const tx = await createKitChainReader(rpc).getTransaction(SIGNATURE, {
      commitment: 'finalized',
    });

    expect(tx).toEqual({
      signature: SIGNATURE,
      err: null,
      blockTime: 1_800_000_100,
      accountKeys: [PAYER, REFERENCE],
      preTokenBalances: [
        { accountIndex: 1, mint: MINT, owner: PAYER, amount: 50_000_000n },
        { accountIndex: 2, mint: MINT, owner: RECIPIENT, amount: 7_000_000n },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: MINT, owner: PAYER, amount: 40_000_000n },
        { accountIndex: 2, mint: MINT, owner: RECIPIENT, amount: 17_000_000n },
      ],
    });
    expect(calls[0]?.args[1]).toEqual({
      commitment: 'finalized',
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: 0,
    });
  });

  it('returns null when the node does not have the transaction or its metadata', async () => {
    const missing = createKitChainReader(fakeRpc({ transaction: null }).rpc);
    expect(await missing.getTransaction(SIGNATURE, { commitment: 'finalized' })).toBeNull();
    const noMeta = createKitChainReader(
      fakeRpc({
        transaction: { blockTime: 1n, meta: null, transaction: { message: { accountKeys: [] } } },
      }).rpc,
    );
    expect(await noMeta.getTransaction(SIGNATURE, { commitment: 'finalized' })).toBeNull();
  });

  it('keeps a missing block time as null and drops balances without an owner', async () => {
    const { rpc } = fakeRpc({
      transaction: {
        blockTime: null,
        meta: {
          err: { InstructionError: [0, 'x'] },
          preTokenBalances: [{ ...tokenBalance(1, PAYER, '1'), owner: undefined }],
          postTokenBalances: undefined,
        },
        transaction: { message: { accountKeys: [] } },
      },
    });
    const tx = await createKitChainReader(rpc).getTransaction(SIGNATURE, {
      commitment: 'finalized',
    });
    expect(tx).toMatchObject({
      blockTime: null,
      err: { InstructionError: [0, 'x'] },
      preTokenBalances: [],
      postTokenBalances: [],
    });
  });

  it('rejects a malformed signature or address before calling the node', async () => {
    const { rpc, calls } = fakeRpc({ signatures: [] });
    const chain = createKitChainReader(rpc);
    await expect(
      chain.getSignaturesForAddress('not-an-address', { limit: 1, commitment: 'finalized' }),
    ).rejects.toThrow();
    await expect(chain.getTransaction('nope', { commitment: 'finalized' })).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
