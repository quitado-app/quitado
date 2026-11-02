import { describe, expect, it } from 'vitest';
import { evaluateTransaction } from './evaluate.ts';
import {
  balance,
  expectation,
  OTHER_MINT,
  PAYER,
  paymentTx,
  RECIPIENT,
  REFERENCE,
} from './test-utils.ts';

describe('evaluateTransaction', () => {
  it('accepts an exact payment and identifies the payer', () => {
    expect(evaluateTransaction(paymentTx('s', 10_000_000n), expectation())).toEqual({
      valid: true,
      received: 10_000_000n,
      payer: PAYER,
    });
  });

  it('accepts an overpayment and reports what was actually received', () => {
    expect(evaluateTransaction(paymentTx('s', 12_500_000n), expectation())).toMatchObject({
      valid: true,
      received: 12_500_000n,
    });
  });

  it('rejects an underpayment', () => {
    expect(evaluateTransaction(paymentTx('s', 9_999_999n), expectation())).toEqual({
      valid: false,
      reason: 'insufficient',
    });
  });

  it('rejects a failed transaction even if its balances look right', () => {
    const tx = paymentTx('s', 10_000_000n, { err: { InstructionError: [0, 'Custom'] } });
    expect(evaluateTransaction(tx, expectation())).toEqual({ valid: false, reason: 'failed' });
  });

  it('rejects a transaction that does not cite the reference', () => {
    const tx = paymentTx('s', 10_000_000n, { accountKeys: [PAYER, RECIPIENT] });
    expect(evaluateTransaction(tx, expectation())).toEqual({
      valid: false,
      reason: 'reference_missing',
    });
  });

  it('rejects a payment in a different mint', () => {
    const tx = paymentTx('s', 10_000_000n, {
      preTokenBalances: [balance(1, PAYER, 50_000_000n, OTHER_MINT)],
      postTokenBalances: [
        balance(1, PAYER, 40_000_000n, OTHER_MINT),
        balance(2, RECIPIENT, 10_000_000n, OTHER_MINT),
      ],
    });
    expect(evaluateTransaction(tx, expectation())).toEqual({ valid: false, reason: 'no_transfer' });
  });

  it('rejects a payment that went to someone else', () => {
    const tx = paymentTx('s', 10_000_000n, {
      postTokenBalances: [balance(1, PAYER, 40_000_000n), balance(2, 'someone-else', 10_000_000n)],
    });
    expect(evaluateTransaction(tx, expectation())).toEqual({ valid: false, reason: 'no_transfer' });
  });

  it('rejects a transaction where the recipient lost tokens', () => {
    const tx = paymentTx('s', 10_000_000n, {
      preTokenBalances: [balance(2, RECIPIENT, 20_000_000n)],
      postTokenBalances: [balance(2, RECIPIENT, 10_000_000n)],
    });
    expect(evaluateTransaction(tx, expectation())).toEqual({ valid: false, reason: 'no_transfer' });
  });

  it('treats a token account created in the same transaction as starting at zero', () => {
    const tx = paymentTx('s', 10_000_000n, {
      preTokenBalances: [balance(1, PAYER, 50_000_000n)],
      postTokenBalances: [balance(1, PAYER, 40_000_000n), balance(2, RECIPIENT, 10_000_000n)],
    });
    expect(evaluateTransaction(tx, expectation())).toMatchObject({
      valid: true,
      received: 10_000_000n,
    });
  });

  it('sums several token accounts owned by the recipient', () => {
    const tx = paymentTx('s', 0n, {
      preTokenBalances: [
        balance(1, PAYER, 50_000_000n),
        balance(2, RECIPIENT, 0n),
        balance(3, RECIPIENT, 0n),
      ],
      postTokenBalances: [
        balance(1, PAYER, 40_000_000n),
        balance(2, RECIPIENT, 6_000_000n),
        balance(3, RECIPIENT, 4_000_000n),
      ],
    });
    expect(evaluateTransaction(tx, expectation())).toMatchObject({
      valid: true,
      received: 10_000_000n,
    });
  });

  it('does not depend on instruction layout: nothing about instructions is read', () => {
    // A wallet appending a guard or memo instruction after the transfer leaves balances unchanged,
    // so the verdict is the same. (The library validator rejects this case.)
    const tx = paymentTx('s', 10_000_000n, {
      accountKeys: [PAYER, 'payer-ata', 'recipient-ata', RECIPIENT, REFERENCE, 'guard-program'],
    });
    expect(evaluateTransaction(tx, expectation()).valid).toBe(true);
  });

  it('omits the payer when nobody lost tokens (for example a mint to the recipient)', () => {
    const tx = paymentTx('s', 10_000_000n, {
      preTokenBalances: [balance(2, RECIPIENT, 0n)],
      postTokenBalances: [balance(2, RECIPIENT, 10_000_000n)],
    });
    expect(evaluateTransaction(tx, expectation())).toEqual({ valid: true, received: 10_000_000n });
  });

  it('is exact above 2^53', () => {
    const big = 9_007_199_254_740_993n;
    const tx = paymentTx('s', big);
    expect(evaluateTransaction(tx, expectation({ amount: big }))).toMatchObject({
      valid: true,
      received: big,
    });
    expect(evaluateTransaction(tx, expectation({ amount: big + 1n }))).toEqual({
      valid: false,
      reason: 'insufficient',
    });
  });
});
