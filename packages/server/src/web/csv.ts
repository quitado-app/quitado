// CSV export of paid invoices, for the owner to hand to an accountant. Pure functions, no I/O.
//
// Format decisions (see docs/web.md):
// - UTF-8 with a byte order mark, so Excel opens accents (João, descrição) correctly instead of
//   guessing an old Windows code page.
// - In Portuguese the separator is ";" and amounts use a decimal comma ("1250,50"): that is what
//   Excel set to Brazilian Portuguese expects, so the file opens straight into columns with numbers
//   it can sum. In English the separator is "," and amounts use a decimal point.
// - No thousands separator in amounts, and every cell is quoted, so a separator inside a text never
//   splits a column.
// - Lines end in CRLF (RFC 4180).
// - Amounts are exact decimals built from the integer base units, never from a float. They are in
//   the token (USDC or USDT): Quitado does not convert to reais.
import { formatUnits, type Invoice } from '@quitado/core';
import type { Lang } from './i18n.ts';
import { t } from './i18n.ts';

export const CSV_BOM = '﻿';

/**
 * Cells that a spreadsheet could read as a formula (=, +, -, @) or that start with a tab or carriage
 * return get a leading apostrophe, so a client name such as "=HYPERLINK(...)" stays plain text.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One CSV cell: neutralised against formulas, then always quoted with inner quotes doubled. */
export function csvCell(value: string): string {
  return `"${neutralizeFormula(value).replace(/"/g, '""')}"`;
}

/** "1250.5" in base units -> "1250.50" (English) or "1250,50" (Portuguese). No grouping. */
export function csvAmount(units: bigint, decimals: number, lang: Lang): string {
  const [whole = '0', fraction = ''] = formatUnits(units, decimals).split('.');
  return `${whole}${lang === 'pt-BR' ? ',' : '.'}${fraction.padEnd(2, '0')}`;
}

/** "UTC-03:00" for -180. */
export function utcOffsetLabel(utcOffsetMinutes: number): string {
  const sign = utcOffsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(utcOffsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

/** "2026-11-02 12:00": date and time in the instance's UTC offset, ISO order in every language. */
export function csvDateTime(ms: number, utcOffsetMinutes: number): string {
  const iso = new Date(ms + utcOffsetMinutes * 60_000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export interface PaidPeriod {
  year?: number;
  /** 1 to 12; only with a year. */
  month?: number;
}

/** Whether a payment time falls in the period, with months cut in the instance's UTC offset. */
export function inPeriod(ms: number, period: PaidPeriod, utcOffsetMinutes: number): boolean {
  const local = new Date(ms + utcOffsetMinutes * 60_000);
  if (period.year !== undefined && local.getUTCFullYear() !== period.year) return false;
  if (period.month !== undefined && local.getUTCMonth() + 1 !== period.month) return false;
  return true;
}

/**
 * Reads ?year=2026&month=11. Empty values mean "not filtered". Returns undefined when a value is
 * not a plain year (2000 to 2999) or month (1 to 12), or when a month comes without a year.
 */
export function parsePeriod(query: URLSearchParams): PaidPeriod | undefined {
  const yearText = (query.get('year') ?? '').trim();
  const monthText = (query.get('month') ?? '').trim();
  const period: PaidPeriod = {};
  if (yearText !== '') {
    if (!/^2\d{3}$/.test(yearText)) return undefined;
    period.year = Number(yearText);
  }
  if (monthText !== '') {
    if (!/^(0?[1-9]|1[0-2])$/.test(monthText) || period.year === undefined) return undefined;
    period.month = Number(monthText);
  }
  return period;
}

/** "quitado-paid-2026-11.csv", "quitado-paid-2026.csv" or "quitado-paid-all.csv". */
export function csvFileName(period: PaidPeriod): string {
  if (period.year === undefined) return 'quitado-paid-all.csv';
  if (period.month === undefined) return `quitado-paid-${period.year}.csv`;
  return `quitado-paid-${period.year}-${String(period.month).padStart(2, '0')}.csv`;
}

/** The whole file: BOM, header row and one row per paid invoice, in the order given. */
export function paidInvoicesCsv(
  invoices: readonly Invoice[],
  options: { lang: Lang; utcOffsetMinutes: number },
): string {
  const { lang, utcOffsetMinutes } = options;
  const separator = lang === 'pt-BR' ? ';' : ',';
  const row = (cells: string[]) => cells.map(csvCell).join(separator);
  const lines = [
    row([
      t(lang, 'csvInvoiceId'),
      t(lang, 'csvPaidAt', { offset: utcOffsetLabel(utcOffsetMinutes) }),
      t(lang, 'csvClient'),
      t(lang, 'csvDescription'),
      t(lang, 'csvToken'),
      t(lang, 'csvInvoiced'),
      t(lang, 'csvReceived'),
      t(lang, 'csvSignature'),
      t(lang, 'csvReference'),
    ]),
  ];
  for (const invoice of invoices) {
    const payment = invoice.payment;
    if (invoice.status !== 'paid' || !payment) continue;
    lines.push(
      row([
        invoice.id,
        csvDateTime(payment.receivedAt, utcOffsetMinutes),
        invoice.clientName,
        invoice.description,
        invoice.asset.symbol,
        csvAmount(invoice.amount, invoice.asset.decimals, lang),
        csvAmount(payment.amount, invoice.asset.decimals, lang),
        payment.signature,
        invoice.reference,
      ]),
    );
  }
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}
