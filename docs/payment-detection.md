# Payment detection

How Quitado decides that an invoice has been paid. Code:
[`packages/server/src/detection`](../packages/server/src/detection).

## How it works

Every invoice has a unique **reference**: a public key nobody owns, included in the payment link.
The wallet cites it in the payment transaction, so the transaction can be found later.

A worker polls the chain for every open invoice:

1. List the signatures that cite the invoice's reference (newest first, paged).
2. Drop the ones that failed on chain.
3. Examine the rest, oldest first. The first transaction that passes is the payment.
4. Settle the invoice (`recordPayment` in core, then `settle` in storage, atomically).

A transaction passes when it did not fail, cites the reference, and the **owner's token accounts
gained at least the invoice amount of the invoice's mint** in that transaction.

## Why not `findReference` + `validateTransfer`

The spike ([spike-devnet.md](./spike-devnet.md)) showed two problems with `@solana/pay`:

- `findReference` returns the oldest transaction that cites the reference and ignores failures. The
  reference is public once the link is shared, so anyone can land a failing transaction first and
  hide the real payment. We examine every candidate instead.
- `validateTransfer` requires the transfer to be the last instruction, so a wallet that appends an
  instruction would make a real payment look invalid. We judge by balance changes, so instruction
  layout does not matter. This is covered by a test on devnet.

## Behavior

| Situation                               | Result                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Exact payment or overpayment            | Settled; the amount actually received is stored                                 |
| Payment smaller than the invoice        | Not settled; the invoice stays open                                             |
| Payment in another token                | Ignored                                                                         |
| Failed transaction citing the reference | Ignored                                                                         |
| Payment after the due date              | Settled: a late payment is still money in the wallet                            |
| One transaction citing two invoices     | The first invoice settles; the second reports a `conflict` event and stays open |
| RPC error on one invoice                | That invoice is retried on the next poll; the others are not affected           |
| Same transaction seen again             | Nothing happens (idempotent)                                                    |

## Choices and limits

- **Commitment defaults to `finalized`.** It costs a few seconds, but a settled invoice can never be
  rolled back. It is configurable (`confirmed` is used in the devnet test to keep it fast).
- **Partial payments are not added together.** Two transactions of 60 and 40 against a 100 invoice
  do not settle it; each is judged alone. Accumulating them is a possible later feature.
- **Work per poll grows with the number of open invoices** (at least one RPC call each, four at a
  time). Fine for a freelancer; revisit if an instance holds thousands of open invoices.
- **Spam is bounded.** At most 500 candidates are examined per reference; beyond that the worker
  emits a `truncated` event instead of looping forever. Rejected transactions are remembered, so
  they are not fetched again on later polls.
- **Token balances need an `owner` field** in the RPC response; entries without one are ignored.
- **Whoever pays is recorded as the payer** only as "the owner whose balance of the token dropped
  the most". It is informational: the invoice settles whoever pays it.
- Which wallets append instructions after the transfer was not verified; the design does not depend
  on it.

## Running the devnet test

It needs the throwaway keys and test token from `packages/spike-devnet` and a payer funded with
devnet SOL. It is skipped unless enabled:

```bash
QUITADO_DEVNET=1 npx vitest run packages/server/src/detection/devnet.e2e.test.ts
```
