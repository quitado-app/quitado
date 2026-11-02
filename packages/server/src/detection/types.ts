// Plain data types for payment detection. Nothing here depends on a Solana library: the kit
// adapter (chain.ts) converts RPC responses into these, so the logic is testable with fakes.

export type Commitment = 'confirmed' | 'finalized';

export interface SignatureInfo {
  signature: string;
  /** Non-null when the transaction failed on chain. */
  err: unknown | null;
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  /** Wallet that owns the token account. */
  owner: string;
  /** Base units. */
  amount: bigint;
}

export interface ParsedTransaction {
  signature: string;
  err: unknown | null;
  /** Unix seconds; null when the cluster did not report it. */
  blockTime: number | null;
  /** Every account the transaction touches, including ones loaded from lookup tables. */
  accountKeys: readonly string[];
  preTokenBalances: readonly TokenBalance[];
  postTokenBalances: readonly TokenBalance[];
}

export interface ChainReader {
  /** Newest first, like the RPC. */
  getSignaturesForAddress(
    address: string,
    options: { limit: number; before?: string; commitment: Commitment },
  ): Promise<SignatureInfo[]>;
  /** Null when the node does not have the transaction (yet). */
  getTransaction(
    signature: string,
    options: { commitment: Commitment },
  ): Promise<ParsedTransaction | null>;
}

/** What a transaction must have done to settle an invoice. */
export interface PaymentExpectation {
  /** Wallet that receives the payment (the instance owner). */
  recipient: string;
  mint: string;
  /** Base units. */
  amount: bigint;
  /** The invoice reference the transaction must cite. */
  reference: string;
}
