import { describe, expect, it } from 'vitest';
import { AmountError, formatUnits, parseUnits } from './money.ts';

describe('parseUnits', () => {
  it('parses whole and fractional amounts exactly', () => {
    expect(parseUnits('12', 6)).toBe(12_000_000n);
    expect(parseUnits('12.5', 6)).toBe(12_500_000n);
    expect(parseUnits('0.000001', 6)).toBe(1n);
    expect(parseUnits('007.10', 6)).toBe(7_100_000n);
    expect(parseUnits('5', 0)).toBe(5n);
  });

  it('is exact where floats are not', () => {
    // 0.1 + 0.2 is the classic float trap; text parsing has no such error.
    expect(parseUnits('0.1', 6) + parseUnits('0.2', 6)).toBe(parseUnits('0.3', 6));
    expect(parseUnits('999999999.999999', 6)).toBe(999_999_999_999_999n);
  });

  it.each(['', ' 1', '1 ', '-1', '+1', '1e3', '1,5', '.5', '5.', '1.2.3', 'abc', '0x10'])(
    'rejects %j',
    (text) => {
      expect(() => parseUnits(text, 6)).toThrow(AmountError);
    },
  );

  it('rejects more decimal places than the asset supports', () => {
    expect(() => parseUnits('1.0000001', 6)).toThrow(/too many decimal places/);
    expect(() => parseUnits('1.5', 0)).toThrow(/too many decimal places/);
  });

  it('rejects invalid decimals', () => {
    expect(() => parseUnits('1', -1)).toThrow(AmountError);
    expect(() => parseUnits('1', 1.5)).toThrow(AmountError);
    expect(() => parseUnits('1', 19)).toThrow(AmountError);
  });
});

describe('formatUnits', () => {
  it('prints the shortest exact decimal text', () => {
    expect(formatUnits(12_500_000n, 6)).toBe('12.5');
    expect(formatUnits(12_000_000n, 6)).toBe('12');
    expect(formatUnits(1n, 6)).toBe('0.000001');
    expect(formatUnits(0n, 6)).toBe('0');
    expect(formatUnits(5n, 0)).toBe('5');
  });

  it('round-trips with parseUnits', () => {
    for (const text of ['0', '1', '0.5', '123456.789012', '999999999.999999']) {
      expect(formatUnits(parseUnits(text, 6), 6)).toBe(text);
    }
  });

  it('rejects negative amounts', () => {
    expect(() => formatUnits(-1n, 6)).toThrow(AmountError);
  });
});
