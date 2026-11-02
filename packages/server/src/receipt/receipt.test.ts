import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createInvoice, mainnetRegistry, recordPayment, type Invoice } from '@quitado/core';
import { buildReceiptPdf, type ReceiptData } from './receipt.ts';

const NOW = Date.UTC(2026, 10, 2, 15, 0, 0);
const DAY = 86_400_000;
const REFERENCE = 'CWEDDyZExHR2bUgqu6LFqcvGS6ZZWB5MYgetmNZMkJTw';
const SIGNATURE =
  '5Spv3aP5j9tn1kYedJotScgVDArCLwejhC4HXBLZBDMP8aPmTK2URVSxF8vgFpXfHd5LRDxptJVjg24BHEZtLHe4';
const PAYER = 'FqzsbMrvNckrLJuEUD9Kuc6d5RMQNbHv5mb4TgdiX6tU';
const RECIPIENT = 'E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL';

function paidInvoice(
  overrides: {
    clientName?: string;
    description?: string;
    amount?: string;
    paid?: bigint;
    payer?: boolean;
  } = {},
): Invoice {
  const invoice = createInvoice(
    {
      id: 'T63cxeXPb7SVn6rgaSGTjA',
      reference: REFERENCE,
      clientName: overrides.clientName ?? 'Acme Inc',
      description: overrides.description ?? 'Website redesign, October',
      assetSymbol: 'USDC',
      amount: overrides.amount ?? '1250.50',
      dueAt: NOW + 14 * DAY,
    },
    mainnetRegistry(),
    NOW,
  );
  return recordPayment(invoice, {
    signature: SIGNATURE,
    amount: overrides.paid ?? invoice.amount,
    receivedAt: NOW + DAY,
    ...(overrides.payer === false ? {} : { payer: PAYER }),
  });
}

const data = (invoice: Invoice, overrides: Partial<ReceiptData> = {}): ReceiptData => ({
  invoice,
  ownerName: 'Davi Freelancer',
  recipient: RECIPIENT,
  cluster: 'mainnet-beta',
  utcOffsetMinutes: -180,
  generatedAt: NOW + 2 * DAY,
  ...overrides,
});

/** The page's drawing instructions, decompressed, with the text pieces extracted in order. */
function readPdf(pdf: Buffer) {
  const text = pdf.toString('latin1');
  const length = Number(/4 0 obj\n<< \/Length (\d+)/.exec(text)![1]);
  const start = text.indexOf('stream\n', text.indexOf('4 0 obj')) + 'stream\n'.length;
  const content = inflateSync(pdf.subarray(start, start + length)).toString('latin1');
  const strings = [...content.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(
    (match) =>
      match[1]!
        .replace(/\\(\d{3})/g, (_m, octal: string) => String.fromCharCode(parseInt(octal, 8)))
        .replace(/\\(.)/g, '$1')
        .replaceAll('\u0085', '…'), // WinAnsi byte 0x85 is the ellipsis
  );
  return { text, content, strings, joined: strings.join('\n') };
}

describe('buildReceiptPdf', () => {
  it('produces a PDF file', () => {
    const pdf = buildReceiptPdf(data(paidInvoice()));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1').endsWith('%%EOF\n')).toBe(true);
    expect(pdf.length).toBeLessThan(20_000);
  });

  it('documents the payment: parties, amount, dates, network, token and transaction', () => {
    const { joined, strings } = readPdf(buildReceiptPdf(data(paidInvoice())));
    expect(strings).toContain('Payment receipt');
    expect(strings).toContain('PAID');
    expect(strings).toContain('1,250.50 USDC');
    expect(joined).toContain('Davi Freelancer');
    expect(joined).toContain('Acme Inc');
    expect(joined).toContain('Website redesign, October');
    expect(joined).toContain(RECIPIENT);
    expect(joined).toContain(PAYER);
    expect(joined).toContain('2026-11-02'); // invoice date
    expect(joined).toContain('2026-11-16'); // due date
    expect(joined).toContain('2026-11-03 12:00 (UTC-03:00)'); // 15:00 UTC + 1 day, in UTC-3
    expect(joined).toContain('Solana');
    expect(joined).toContain('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(joined).toContain('Invoice T63cxeXPb7SVn6rgaSGTjA');
    expect(joined).toContain('not a tax document');
  });

  it('prints the whole transaction signature, even when it wraps', () => {
    const { strings } = readPdf(buildReceiptPdf(data(paidInvoice())));
    // The signature is drawn in several consecutive lines; read in order they spell it out.
    expect(strings.length).toBeGreaterThan(1);
    expect(strings.join('')).toContain(SIGNATURE);
    expect(strings.filter((piece) => piece === SIGNATURE)).toEqual([]); // really was wrapped
  });

  it('links to the block explorer, as text, as a clickable area and as a QR code', () => {
    const { text, strings, content } = readPdf(buildReceiptPdf(data(paidInvoice())));
    const url = `https://explorer.solana.com/tx/${SIGNATURE}`;
    expect(strings.join('')).toContain(url);
    expect(text).toContain(`/URI (${url})`);
    // The QR code is many squares filled in one go (no hairline seams between them).
    expect((content.match(/ re\b/g) ?? []).length).toBeGreaterThan(100);
    expect(content).toMatch(/0 0 0 rg (?:[\d. -]+ re )+f/);
  });

  it('marks devnet receipts as test network payments and links the devnet explorer', () => {
    const { text, joined } = readPdf(buildReceiptPdf(data(paidInvoice(), { cluster: 'devnet' })));
    expect(joined).toContain('Solana devnet (test network)');
    expect(text).toContain('?cluster=devnet)');
  });

  it('shows the invoice amount separately when the customer overpaid', () => {
    const invoice = paidInvoice({ amount: '10', paid: 12_500_000n });
    const { strings } = readPdf(buildReceiptPdf(data(invoice)));
    expect(strings).toContain('12.50 USDC');
    expect(strings).toContain('Invoice amount: 10.00 USDC');
  });

  it('does not show an invoice amount line for an exact payment', () => {
    expect(readPdf(buildReceiptPdf(data(paidInvoice()))).joined).not.toContain('Invoice amount:');
  });

  it('leaves out the sender and payer lines when they are unknown', () => {
    const { joined } = readPdf(
      buildReceiptPdf(data(paidInvoice({ payer: false }), { ownerName: undefined })),
    );
    expect(joined).not.toContain('FROM');
    expect(joined).not.toContain('PAID FROM');
    expect(joined).not.toContain(PAYER);
  });

  it('keeps accented names readable', () => {
    const { joined } = readPdf(
      buildReceiptPdf(data(paidInvoice({ clientName: 'José Conceição Ltda' }))),
    );
    expect(joined).toContain('José Conceição Ltda');
  });

  it('cannot be broken by hostile text in the client name or description', () => {
    const hostile = ') Tj ET 0 0 m (';
    const pdf = buildReceiptPdf(data(paidInvoice({ clientName: hostile, description: hostile })));
    const { joined } = readPdf(pdf);
    expect(joined).toContain(hostile);
    expect(pdf.toString('latin1').endsWith('%%EOF\n')).toBe(true);
  });

  describe('text that is too long for the page', () => {
    const longDescription = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '
      .repeat(18)
      .slice(0, 1000);

    it('keeps a realistic long description whole', () => {
      const description = 'Website redesign. '.repeat(20).trim(); // 359 characters
      const { joined } = readPdf(buildReceiptPdf(data(paidInvoice({ description }))));
      expect(joined.replaceAll('\n', ' ')).toContain('Website redesign. Website redesign.');
      expect(joined).not.toContain('…');
    });

    it('fits with every field at its maximum length, clipping with an ellipsis', () => {
      const invoice = paidInvoice({
        clientName: 'W'.repeat(200),
        description: longDescription,
        amount: '999999999.999999',
      });
      const pdf = buildReceiptPdf(data(invoice, { ownerName: 'O'.repeat(100), cluster: 'devnet' }));
      const { text, joined, strings } = readPdf(pdf);
      // Names are clipped, and what was cut is marked.
      expect(joined).toContain('…');
      expect(joined).not.toContain('W'.repeat(200));
      // What proves the payment is never cut: amount, signature and the explorer link.
      expect(strings).toContain('999,999,999.999999 USDC');
      expect(strings.join('')).toContain(SIGNATURE);
      expect(text).toContain(`/URI (https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet)`);
      expect(text.endsWith('%%EOF\n')).toBe(true);
    });

    it('cuts the description only as far as the page requires', () => {
      const invoice = paidInvoice({ description: longDescription });
      const { strings } = readPdf(buildReceiptPdf(data(invoice)));
      const shown = strings.filter((piece) => longDescription.includes(piece.replace('…', '')));
      expect(shown.length).toBeGreaterThan(6); // plenty of the description is still there
    });
  });

  it('is deterministic for the same input', () => {
    const invoice = paidInvoice();
    expect(buildReceiptPdf(data(invoice)).equals(buildReceiptPdf(data(invoice)))).toBe(true);
  });

  it('refuses an invoice that is not paid', () => {
    const open = createInvoice(
      {
        id: 'T63cxeXPb7SVn6rgaSGTjA',
        reference: REFERENCE,
        clientName: 'Acme',
        description: 'Work',
        assetSymbol: 'USDC',
        amount: '10',
        dueAt: NOW + DAY,
      },
      mainnetRegistry(),
      NOW,
    );
    expect(() => buildReceiptPdf(data(open))).toThrow(/paid invoice/);
  });
});
