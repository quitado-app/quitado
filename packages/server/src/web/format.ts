import { formatUnits } from '@quitado/core';
import type { Lang } from './i18n.ts';

/**
 * "12.5" -> "12.50", "1250" -> "1,250.00" (in Portuguese "1.250,00").
 * Exact: built from the bigint, never from a float.
 */
export function displayAmount(units: bigint, decimals: number, lang: Lang = 'en'): string {
  const [whole = '0', fraction = ''] = formatUnits(units, decimals).split('.');
  const [group, decimal] = lang === 'pt-BR' ? ['.', ','] : [',', '.'];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${grouped}${decimal}${fraction.padEnd(2, '0')}`;
}

/** Calendar date of a timestamp in a fixed UTC offset: YYYY-MM-DD, or DD/MM/YYYY in Portuguese. */
export function formatDate(ms: number, utcOffsetMinutes: number, lang: Lang = 'en'): string {
  const iso = new Date(ms + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
  return lang === 'pt-BR' ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}

/** "2026-11-02 12:34 (UTC-03:00)": date and time in a fixed UTC offset, with the offset spelled out. */
export function formatDateTime(ms: number, utcOffsetMinutes: number): string {
  const iso = new Date(ms + utcOffsetMinutes * 60_000).toISOString();
  const sign = utcOffsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(utcOffsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} (UTC${sign}${hours}:${minutes})`;
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
