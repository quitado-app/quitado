// Adapter from @solana/kit RPC responses to the plain types the detector works with.
import {
  address,
  signature as toSignature,
  type GetSignaturesForAddressApi,
  type GetTransactionApi,
  type Rpc,
} from '@solana/kit';
import type { ChainReader, ParsedTransaction, TokenBalance } from './types.ts';

export function createKitChainReader(
  rpc: Rpc<GetSignaturesForAddressApi & GetTransactionApi>,
): ChainReader {
  return {
    async getSignaturesForAddress(target, { limit, before, commitment }) {
      const infos = await rpc
        .getSignaturesForAddress(address(target), {
          limit,
          commitment,
          ...(before === undefined ? {} : { before: toSignature(before) }),
        })
        .send();
      return infos.map((info) => ({ signature: info.signature, err: info.err }));
    },

    async getTransaction(sig, { commitment }): Promise<ParsedTransaction | null> {
      // jsonParsed gives us token balances with their owners and the full account list.
      const tx = await rpc
        .getTransaction(toSignature(sig), {
          commitment,
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
        })
        .send();
      if (!tx || !tx.meta) return null;

      const { meta } = tx;
      // In jsonParsed form this list already includes accounts loaded from address lookup tables
      // (each key carries source: 'lookupTable' | 'transaction'), so a wallet may put the reference there.
      const accountKeys = tx.transaction.message.accountKeys.map((key) => key.pubkey);

      const balances = (list: typeof meta.preTokenBalances): TokenBalance[] => {
        const result: TokenBalance[] = [];
        for (const balance of list ?? []) {
          // Without an owner we cannot tell whose balance it is, so it can never match a recipient.
          if (!balance.owner) continue;
          result.push({
            accountIndex: balance.accountIndex,
            mint: balance.mint,
            owner: balance.owner,
            amount: BigInt(balance.uiTokenAmount.amount),
          });
        }
        return result;
      };

      return {
        signature: sig,
        err: meta.err,
        blockTime: tx.blockTime === null ? null : Number(tx.blockTime),
        accountKeys,
        preTokenBalances: balances(meta.preTokenBalances),
        postTokenBalances: balances(meta.postTokenBalances),
      };
    },
  };
}
