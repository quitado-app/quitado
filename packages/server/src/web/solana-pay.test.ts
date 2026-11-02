import { describe, expect, it } from 'vitest';
import { address } from '@solana/kit';
import { encodeURL, parseURL } from '@solana/pay';
import { buildPaymentUrl, type PaymentRequest } from './solana-pay.ts';

const request: PaymentRequest = {
  recipient: 'E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL',
  amount: 12_500_000n,
  decimals: 6,
  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  reference: 'CWEDDyZExHR2bUgqu6LFqcvGS6ZZWB5MYgetmNZMkJTw',
};

describe('buildPaymentUrl', () => {
  it('builds a spec-shaped transfer request with an exact decimal amount', () => {
    expect(buildPaymentUrl(request)).toBe(
      'solana:E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL' +
        '?amount=12.5&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' +
        '&reference=CWEDDyZExHR2bUgqu6LFqcvGS6ZZWB5MYgetmNZMkJTw',
    );
  });

  it('keeps the largest allowed amount exact', () => {
    const url = buildPaymentUrl({ ...request, amount: 999_999_999_999_999n });
    expect(url).toContain('amount=999999999.999999&');
  });

  it('encodes label and message so they cannot break out of the query', () => {
    const url = buildPaymentUrl({
      ...request,
      label: 'Acme & Co',
      message: 'Invoice #1?x=1&amount=0',
    });
    expect(url).toContain('&label=Acme%20%26%20Co');
    expect(url).toContain('&message=Invoice%20%231%3Fx%3D1%26amount%3D0');
    const params = new URL(url.replace('solana:', 'https://x/')).searchParams;
    expect(params.get('amount')).toBe('12.5');
    expect(params.get('message')).toBe('Invoice #1?x=1&amount=0');
  });

  it('rejects malformed addresses and non-positive amounts', () => {
    expect(() => buildPaymentUrl({ ...request, recipient: 'nope' })).toThrow(/recipient/);
    expect(() => buildPaymentUrl({ ...request, mint: 'a&b' })).toThrow(/mint/);
    expect(() => buildPaymentUrl({ ...request, reference: '' })).toThrow(/reference/);
    expect(() => buildPaymentUrl({ ...request, amount: 0n })).toThrow(/greater than zero/);
  });

  describe('interop with the @solana/pay reference implementation', () => {
    const encodeWithLibrary = (label?: string, message?: string) =>
      encodeURL({
        recipient: address(request.recipient),
        amount: 12.5,
        splToken: address(request.mint),
        reference: address(request.reference),
        ...(label === undefined ? {} : { label }),
        ...(message === undefined ? {} : { message }),
      }).toString();

    it('produces byte-for-byte the URL @solana/pay encodes when text has no spaces', () => {
      expect(buildPaymentUrl({ ...request, label: 'Acme', message: 'Work' })).toBe(
        encodeWithLibrary('Acme', 'Work'),
      );
      expect(buildPaymentUrl(request)).toBe(encodeWithLibrary());
    });

    it('encodes spaces as %20 where the library uses +, and both parse to the same fields', () => {
      // %20 is understood by decodeURIComponent and by URLSearchParams; "+" only by the latter, so a
      // wallet using decodeURIComponent would show a literal "+". We pick the safer encoding.
      const ours = buildPaymentUrl({ ...request, label: 'Acme Inc', message: 'Website redesign' });
      const theirs = encodeWithLibrary('Acme Inc', 'Website redesign');
      expect(ours).toContain('label=Acme%20Inc');
      expect(theirs).toContain('label=Acme+Inc');
      expect(parseURL(ours)).toEqual(parseURL(theirs));
      expect(parseURL(ours)).toMatchObject({ label: 'Acme Inc', message: 'Website redesign' });
    });

    it('is parsed back by @solana/pay into the same fields', () => {
      const parsed = parseURL(buildPaymentUrl({ ...request, label: 'Acme', message: 'Work' }));
      expect(parsed).toMatchObject({
        recipient: request.recipient,
        amount: 12.5,
        splToken: request.mint,
        reference: [request.reference],
        label: 'Acme',
        message: 'Work',
      });
    });
  });
});
