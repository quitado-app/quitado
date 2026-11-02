import { formatUnits } from '@quitado/core';

/** "12.5" -> "12.50", "1250" -> "1,250.00". Exact: built from the bigint, never from a float. */
export function displayAmount(units: bigint, decimals: number): string {
  const [whole = '0', fraction = ''] = formatUnits(units, decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${fraction.padEnd(2, '0')}`;
}

/** Calendar date (YYYY-MM-DD) of a timestamp in a fixed UTC offset. */
export function formatDate(ms: number, utcOffsetMinutes: number): string {
  return new Date(ms + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * Turns a YYYY-MM-DD date into the last second of that day in the given UTC offset.
 * Returns undefined for anything that is not a real calendar date.
 */
export function endOfDay(date: string, utcOffsetMinutes: number): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return undefined;
  }
  return Date.UTC(year, month - 1, day, 23, 59, 59) - utcOffsetMinutes * 60_000;
}

export function explorerTxUrl(signature: string, cluster: 'mainnet-beta' | 'devnet'): string {
  const suffix = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${suffix}`;
}

/** "E2pDM8RR...FbQxL": enough to recognize an address in a list. */
export function shorten(text: string, keep = 5): string {
  return text.length <= keep * 2 + 1 ? text : `${text.slice(0, keep)}…${text.slice(-keep)}`;
}
