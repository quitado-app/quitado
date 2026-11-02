import { describe, expect, it } from 'vitest';
import { findPayment } from './find-payment.ts';
import { expectation, FakeChain, PAYER, paymentTx, REFERENCE } from './test-utils.ts';

const options = { commitment: 'finalized' as const };

describe('findPayment', () => {
  it('finds a valid payment and converts the block time to milliseconds', async () => {
    const chain = new FakeChain().add(REFERENCE, paymentTx('good', 10_000_000n));
    const result = await findPayment(chain, expectation(), options);
    expect(result.payment).toEqual({
      signature: 'good',
      received: 10_000_000n,
      receivedAt: 1_800_000_100_000,
      payer: PAYER,
    });
    expect(result.truncated).toBe(false);
  });

  it('reports a null time when the cluster has no block time', async () => {
    const chain = new FakeChain().add(
      REFERENCE,
      paymentTx('good', 10_000_000n, { blockTime: null }),
    );
    expect((await findPayment(chain, expectation(), options)).payment?.receivedAt).toBeNull();
  });

  it('returns null when nothing cites the reference', async () => {
    const result = await findPayment(new FakeChain(), expectation(), options);
    expect(result).toMatchObject({ payment: null, truncated: false, examined: 0 });
  });

  it('is not fooled by a failed transaction that cites the reference first', async () => {
    const chain = new FakeChain()
      .add(REFERENCE, paymentTx('failed', 10_000_000n, { err: { InstructionError: [0, 'x'] } }))
      .add(REFERENCE, paymentTx('good', 10_000_000n));
    const result = await findPayment(chain, expectation(), options);
    expect(result.payment?.signature).toBe('good');
    // The failed transaction is dropped from the listing and never fetched.
    expect(chain.calls.transactions).toBe(1);
  });

  it('is not fooled by an underpaying or wrong transaction cited first', async () => {
    const chain = new FakeChain()
      .add(REFERENCE, paymentTx('dust', 1n))
      .add(REFERENCE, paymentTx('no-ref', 10_000_000n, { accountKeys: ['nothing'] }))
      .add(REFERENCE, paymentTx('good', 10_000_000n));
    const result = await findPayment(chain, expectation(), options);
    expect(result.payment?.signature).toBe('good');
    expect([...result.rejections]).toEqual([
      ['dust', 'insufficient'],
      ['no-ref', 'reference_missing'],
    ]);
  });

  it('settles with the earliest valid payment when there are several', async () => {
    const chain = new FakeChain()
      .add(REFERENCE, paymentTx('first', 10_000_000n))
      .add(REFERENCE, paymentTx('second', 10_000_000n));
    expect((await findPayment(chain, expectation(), options)).payment?.signature).toBe('first');
  });

  it('skips signatures the node cannot serve yet, without judging them', async () => {
    const chain = new FakeChain()
      .add(REFERENCE, null, 'not-yet')
      .add(REFERENCE, paymentTx('good', 10_000_000n));
    const rejected = new Set<string>();
    const result = await findPayment(chain, expectation(), { ...options, rejected });
    expect(result.payment?.signature).toBe('good');
    expect(rejected.has('not-yet')).toBe(false);
  });

  it('remembers rejected transactions so later polls do not fetch them again', async () => {
    const chain = new FakeChain().add(REFERENCE, paymentTx('dust', 1n));
    const rejected = new Set<string>();
    await findPayment(chain, expectation(), { ...options, rejected });
    await findPayment(chain, expectation(), { ...options, rejected });
    expect(chain.calls.transactions).toBe(1);
    expect(chain.calls.signatures).toBe(2);
  });

  it('still finds a payment that arrives after earlier rejections were remembered', async () => {
    const chain = new FakeChain().add(REFERENCE, paymentTx('dust', 1n));
    const rejected = new Set<string>();
    expect((await findPayment(chain, expectation(), { ...options, rejected })).payment).toBeNull();
    chain.add(REFERENCE, paymentTx('good', 10_000_000n));
    expect(
      (await findPayment(chain, expectation(), { ...options, rejected })).payment?.signature,
    ).toBe('good');
  });

  describe('pagination', () => {
    const spam = (chain: FakeChain, count: number) => {
      for (let i = 0; i < count; i++) chain.add(REFERENCE, paymentTx(`spam-${i}`, 1n));
    };

    it('walks back through pages to reach an old payment buried under spam', async () => {
      const chain = new FakeChain().add(REFERENCE, paymentTx('good', 10_000_000n));
      spam(chain, 250);
      const result = await findPayment(chain, expectation(), {
        ...options,
        pageSize: 100,
        maxPages: 5,
      });
      expect(result.payment?.signature).toBe('good');
      expect(result.truncated).toBe(false);
      expect(chain.calls.signatures).toBe(3);
    });

    it('flags truncation when there are more candidates than it will walk', async () => {
      const chain = new FakeChain().add(REFERENCE, paymentTx('good', 10_000_000n));
      spam(chain, 250);
      const result = await findPayment(chain, expectation(), {
        ...options,
        pageSize: 100,
        maxPages: 2,
      });
      expect(result.payment).toBeNull();
      expect(result.truncated).toBe(true);
    });

    it('does not flag truncation when the last page is exactly full but nothing more exists', async () => {
      const chain = new FakeChain();
      spam(chain, 200);
      const result = await findPayment(chain, expectation(), {
        ...options,
        pageSize: 100,
        maxPages: 3,
      });
      expect(result.truncated).toBe(false);
    });
  });

  it('passes the commitment through to the chain', async () => {
    const seen: string[] = [];
    const chain = new FakeChain();
    const original = chain.getSignaturesForAddress.bind(chain);
    chain.getSignaturesForAddress = async (address, opts) => {
      seen.push(opts.commitment);
      return original(address, opts);
    };
    await findPayment(chain, expectation(), { commitment: 'confirmed' });
    expect(seen).toEqual(['confirmed']);
  });
});
