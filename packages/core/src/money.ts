// Amounts are bigint base units (for a 6-decimals stablecoin, 1 USDC = 1_000_000n).
// Floats never touch money: decimal text is parsed and printed with string arithmetic only.

export class AmountError extends Error {
  override name = 'AmountError';
}

const MAX_DECIMALS = 18;

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new AmountError(`invalid decimals: ${decimals}`);
  }
}

/** Parses plain decimal text ("12.5") into base units. No signs, exponents or separators. */
export function parseUnits(text: string, decimals: number): bigint {
  assertDecimals(decimals);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new AmountError(`invalid amount: ${JSON.stringify(text)}`);
  const whole = match[1]!;
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) {
    throw new AmountError(`too many decimal places (max ${decimals}): ${text}`);
  }
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

/** Prints base units as the shortest exact decimal text (12500000n, 6 -> "12.5"). */
export function formatUnits(units: bigint, decimals: number): string {
  assertDecimals(decimals);
  if (units < 0n) throw new AmountError('negative amount');
  const digits = units.toString().padStart(decimals + 1, '0');
  const split = digits.length - decimals;
  const whole = digits.slice(0, split);
  const fraction = digits.slice(split).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
