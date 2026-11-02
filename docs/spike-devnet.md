# Spike: Solana Pay payment detection on devnet

Status: done (step 1 of the MVP plan). Code: [`packages/spike-devnet`](../packages/spike-devnet).

## Goal

Decide how Quitado builds payment requests and detects payments, and find the edge cases that
matter before writing the core. Everything ran against Solana devnet with throwaway keys and a
self-made 6-decimals test token (a stand-in for USDC/USDT).

## Stack findings

- `@solana/pay` 1.0.26 is built on `@solana/kit` v6 (peer `^6.9`), not on `@solana/web3.js`.
  We keep `@solana/kit` on 6.x even though newer majors exist, and pin exact versions.
- The package also ships a `pay.sh` CLI whose `install.cjs` downloads a binary. Install scripts
  are disabled repo-wide (`.npmrc`), so it is never fetched.
- `amount` in `@solana/pay` is a JavaScript `number`. Quitado stores amounts as `bigint` base units
  and converts only at the boundary.
- `createTransfer`, `encodeURL`, `parseURL` and `validateTransfer` work as documented.

## Results

| #   | Scenario                                                                | Result                                                                         |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Happy path: URL, `createTransfer`, `findReference`, `validateTransfer`  | Pass                                                                           |
| 2   | Underpayment (19.99 paid, 20 expected)                                  | Rejected: `amount not transferred`                                             |
| 3   | Overpayment (6 paid, 5 expected)                                        | Accepted                                                                       |
| 4   | A failed transaction citing the reference lands before the real payment | `findReference` returns the failed one; our `detectPayment` finds the real one |
| 5   | Payment made in a different mint                                        | Rejected: `invalid transfer`                                                   |
| 6   | A valid transfer followed by another instruction                        | Rejected: `invalid transfer`                                                   |

## Findings that change the design

1. **`findReference` is not safe as the detector.** It returns the oldest signature that cites the
   reference and ignores whether that transaction failed. The reference is public once the payment
   link is shared, so anyone can land a failing transaction first and the real payment is never
   seen (scenario 4). Quitado uses its own detector ([`detect.ts`](../packages/spike-devnet/src/detect.ts)):
   it lists every signature for the reference, skips failed ones, validates each candidate and
   returns the first valid payment. The number of candidates is bounded.
2. **`validateTransfer` requires the transfer to be the last instruction** (scenario 6). Wallets
   can append instructions after the transfer, and in that case a real payment would be rejected.
   Which wallets do this was not verified. The step 4 detector needs its own validator that finds
   the transfer to the merchant's token account among all instructions, and a test per wallet we
   support.
3. **Amounts are floats in the library.** See above: `bigint` internally.
4. **Overpayment is accepted** by `validateTransfer`. The invoice should record the amount actually
   received, not the amount requested.

## Mainnet mints (read-only check)

Both addresses from the project notes exist on mainnet, are owned by the classic Token program,
are initialized and use 6 decimals:

| Token | Mint                                           | Decimals |
| ----- | ---------------------------------------------- | -------- |
| USDC  | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6        |
| USDT  | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6        |

Both mints have a **freeze authority**: the issuer can freeze a token account. This is a property
of the stablecoins, not of Quitado, and is worth a line in the user-facing docs. That these are
the issuers' official mints was checked only by matching the addresses in the project notes;
confirm against the issuers' own documentation before relying on them in production.

## Operational notes

- The public devnet RPC no longer serves `requestAirdrop` (HTTP 410). Use https://faucet.solana.com.
- The public RPC answers HTTP 429 on long runs. Production needs a configurable RPC URL and retries.
- Node 24 runs the TypeScript scripts directly (`node src/setup.ts`).
