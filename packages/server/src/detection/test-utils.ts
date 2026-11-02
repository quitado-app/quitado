// Helpers shared by the detection tests: transaction builders and an in-memory chain.
import type {
  ChainReader,
  Commitment,
  ParsedTransaction,
  PaymentExpectation,
  SignatureInfo,
  TokenBalance,
} from './types.ts';

export const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const OTHER_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
export const RECIPIENT = 'E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL';
export const PAYER = 'FqzsbMrvNckrLJuEUD9Kuc6d5RMQNbHv5mb4TgdiX6tU';
export const REFERENCE = 'CWEDDyZExHR2bUgqu6LFqcvGS6ZZWB5MYgetmNZMkJTw';

export const expectation = (overrides: Partial<PaymentExpectation> = {}): PaymentExpectation => ({
  recipient: RECIPIENT,
  mint: MINT,
  amount: 10_000_000n,
  reference: REFERENCE,
  ...overrides,
});

const balance = (
  accountIndex: number,
  owner: string,
  amount: bigint,
  mint = MINT,
): TokenBalance => ({ accountIndex, mint, owner, amount });

/** A payment of `amount` base units from PAYER to RECIPIENT that cites REFERENCE. */
export function paymentTx(
  signature: string,
  amount: bigint,
  overrides: Partial<ParsedTransaction> = {},
): ParsedTransaction {
  return {
    signature,
    err: null,
    blockTime: 1_800_000_100,
    accountKeys: [PAYER, 'payer-ata', 'recipient-ata', RECIPIENT, REFERENCE],
    preTokenBalances: [balance(1, PAYER, 50_000_000n), balance(2, RECIPIENT, 7_000_000n)],
    postTokenBalances: [
      balance(1, PAYER, 50_000_000n - amount),
      balance(2, RECIPIENT, 7_000_000n + amount),
    ],
    ...overrides,
  };
}

export { balance };

/** An in-memory chain: signatures per address (oldest first) and transactions by signature. */
export class FakeChain implements ChainReader {
  readonly calls = { signatures: 0, transactions: 0 };
  private readonly byAddress = new Map<string, SignatureInfo[]>();
  private readonly transactions = new Map<string, ParsedTransaction | null>();
  failOn = new Set<string>();

  add(address: string, tx: ParsedTransaction | null, signature = tx?.signature): this {
    if (!signature) throw new Error('signature required');
    const list = this.byAddress.get(address) ?? [];
    list.push({ signature, err: tx?.err ?? null });
    this.byAddress.set(address, list);
    this.transactions.set(signature, tx);
    return this;
  }

  async getSignaturesForAddress(
    address: string,
    options: { limit: number; before?: string; commitment: Commitment },
  ): Promise<SignatureInfo[]> {
    this.calls.signatures += 1;
    if (this.failOn.has(address)) throw new Error(`rpc down for ${address}`);
    const newestFirst = [...(this.byAddress.get(address) ?? [])].reverse();
    const start = options.before
      ? newestFirst.findIndex((s) => s.signature === options.before) + 1
      : 0;
    return newestFirst.slice(start, start + options.limit);
  }

  async getTransaction(signature: string): Promise<ParsedTransaction | null> {
    this.calls.transactions += 1;
    return this.transactions.get(signature) ?? null;
  }
}
