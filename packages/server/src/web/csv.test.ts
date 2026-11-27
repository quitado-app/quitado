import { describe, expect, it } from 'vitest';
import type { Invoice } from '@quitado/core';
import {
  CSV_BOM,
  csvAmount,
  csvCell,
  csvDateTime,
  csvFileName,
  inPeriod,
  neutralizeFormula,
  paidInvoicesCsv,
  parsePeriod,
  utcOffsetLabel,
} from './csv.ts';

const paid = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'abcdefghijklmnopqrstuv',
  reference: 'RefRefRefRefRefRefRefRefRefRefRefRefRefRef1',
  clientName: 'João & Cia',
  description: 'Site, novembro',
  asset: { symbol: 'USDC', mint: 'mint', decimals: 6 },
  amount: 1_250_500_000n,
  dueAt: 0,
  createdAt: 0,
  status: 'paid',
  payment: { signature: 'sig-1', amount: 1_250_500_001n, receivedAt: Date.UTC(2026, 10, 2, 15) },
  ...overrides,
});

describe('csv cells', () => {
  it('neutralises anything a spreadsheet could run as a formula', () => {
    for (const start of ['=', '+', '-', '@', '\t', '\r']) {
      expect(neutralizeFormula(`${start}HYPERLINK("http://x")`)).toBe(
        `'${start}HYPERLINK("http://x")`,
      );
    }
    expect(neutralizeFormula('Acme = good')).toBe('Acme = good');
    expect(neutralizeFormula('')).toBe('');
  });

  it('always quotes and doubles inner quotes, so separators and newlines stay inside the cell', () => {
    expect(csvCell('plain')).toBe('"plain"');
    expect(csvCell('say "hi"; ok, then\r\nnext')).toBe('"say ""hi""; ok, then\r\nnext"');
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('"=1+1')).toBe('"""=1+1"');
  });
});

describe('csv amounts and dates', () => {
  it('prints exact decimals from base units, with the separator of the language and no grouping', () => {
    expect(csvAmount(1_250_500_000n, 6, 'en')).toBe('1250.50');
    expect(csvAmount(1_250_500_000n, 6, 'pt-BR')).toBe('1250,50');
    expect(csvAmount(1n, 6, 'en')).toBe('0.000001');
    expect(csvAmount(999_999_999_999_999n, 6, 'pt-BR')).toBe('999999999,999999');
    expect(csvAmount(7n, 0, 'en')).toBe('7.00');
  });

  it('writes the date in the instance offset and names that offset', () => {
    expect(csvDateTime(Date.UTC(2026, 10, 2, 1, 30), -180)).toBe('2026-11-01 22:30');
    expect(utcOffsetLabel(-180)).toBe('UTC-03:00');
    expect(utcOffsetLabel(0)).toBe('UTC+00:00');
    expect(utcOffsetLabel(330)).toBe('UTC+05:30');
  });
});

describe('csv period filter', () => {
  const query = (text: string) => new URLSearchParams(text);

  it('reads a year and an optional month, and treats empty values as no filter', () => {
    expect(parsePeriod(query(''))).toEqual({});
    expect(parsePeriod(query('year=&month='))).toEqual({});
    expect(parsePeriod(query('year=2026'))).toEqual({ year: 2026 });
    expect(parsePeriod(query('year=2026&month=03'))).toEqual({ year: 2026, month: 3 });
    expect(parsePeriod(query('year=2026&month=12'))).toEqual({ year: 2026, month: 12 });
  });

  it('refuses anything that is not a plain year or month', () => {
    for (const text of [
      'year=26',
      'year=20266',
      'year=1999',
      'year=2026.0',
      'year=-2026',
      'year=2026&month=0',
      'year=2026&month=13',
      'year=2026&month=1x',
      'month=11',
    ]) {
      expect(parsePeriod(query(text)), text).toBeUndefined();
    }
  });

  it('cuts months in the instance offset', () => {
    // 2026-12-01 01:00 UTC is still 30 November in UTC-03:00.
    const at = Date.UTC(2026, 11, 1, 1, 0);
    expect(inPeriod(at, { year: 2026, month: 11 }, -180)).toBe(true);
    expect(inPeriod(at, { year: 2026, month: 12 }, -180)).toBe(false);
    expect(inPeriod(at, { year: 2026, month: 12 }, 0)).toBe(true);
    expect(inPeriod(at, {}, -180)).toBe(true);
  });

  it('names the file after the period', () => {
    expect(csvFileName({})).toBe('quitado-paid-all.csv');
    expect(csvFileName({ year: 2026 })).toBe('quitado-paid-2026.csv');
    expect(csvFileName({ year: 2026, month: 3 })).toBe('quitado-paid-2026-03.csv');
  });
});

describe('paid invoices csv', () => {
  it('starts with a BOM, uses ";" in Portuguese and "," in English, and ends lines in CRLF', () => {
    const pt = paidInvoicesCsv([paid()], { lang: 'pt-BR', utcOffsetMinutes: -180 });
    expect(pt.startsWith(CSV_BOM)).toBe(true);
    const [header, row, last] = pt.slice(1).split('\r\n');
    expect(header).toBe(
      '"ID da fatura";"Pago em (UTC-03:00)";"Cliente";"Descrição";"Token";"Valor faturado";"Valor recebido";"Assinatura da transação";"Referência do pagamento"',
    );
    expect(row).toBe(
      '"abcdefghijklmnopqrstuv";"2026-11-02 12:00";"João & Cia";"Site, novembro";"USDC";"1250,50";"1250,500001";"sig-1";"RefRefRefRefRefRefRefRefRefRefRefRefRefRef1"',
    );
    expect(last).toBe('');

    const en = paidInvoicesCsv([paid()], { lang: 'en', utcOffsetMinutes: -180 }).slice(1);
    expect(en.split('\r\n')[0]).toContain('"Invoice ID","Paid at (UTC-03:00)","Client"');
    expect(en).toContain('"USDC","1250.50","1250.500001"');
  });

  it('skips anything that is not paid and writes only the header when there is nothing', () => {
    const open = paid({ status: 'open' });
    delete open.payment;
    const csv = paidInvoicesCsv([open], { lang: 'en', utcOffsetMinutes: 0 });
    expect(csv.slice(1).split('\r\n')).toHaveLength(2); // header and the final empty line
  });
});
