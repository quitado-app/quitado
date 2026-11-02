// Lays out the payment receipt: one A4 page that documents a settled invoice, with the transaction
// signature, a link and a QR code to verify it on a block explorer.
import { correction, generate } from 'lean-qr';
import type { Cluster, Invoice } from '@quitado/core';
import { displayAmount, explorerTxUrl, formatDate, formatDateTime } from '../web/format.ts';
import { ellipsize, PdfPage, renderPdf, textWidth, wrapText, type Font, type Rgb } from './pdf.ts';

export interface ReceiptData {
  /** Must be a paid invoice. */
  invoice: Invoice;
  ownerName: string | undefined;
  /** Wallet that received the payment. */
  recipient: string;
  cluster: Cluster;
  utcOffsetMinutes: number;
  /** Unix ms; the moment the PDF is produced. */
  generatedAt: number;
}

const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 56;
const LABEL_WIDTH = 130;
const VALUE_X = MARGIN + LABEL_WIDTH;
const VALUE_WIDTH = WIDTH - MARGIN - VALUE_X;
const FOOTER_TOP = HEIGHT - 70; // nothing but the footer may go below this line (measured from the top)

// The names are clipped to two lines; the description takes whatever room is left (never fewer than
// MIN_DESCRIPTION_LINES). The full text always remains on the invoice page.
const NAME_LINES = 2;
const MAX_DESCRIPTION_LINES = 60;
const MIN_DESCRIPTION_LINES = 3;

const INK: Rgb = [0.09, 0.1, 0.12];
const MUTED: Rgb = [0.4, 0.42, 0.47];
const GREEN: Rgb = [0.04, 0.49, 0.23];
const GREEN_BG: Rgb = [0.89, 0.96, 0.92];
const BLUE: Rgb = [0.04, 0.37, 1];
const RULE: Rgb = [0.85, 0.87, 0.9];

class DoesNotFit extends Error {}

export function buildReceiptPdf(data: ReceiptData): Buffer {
  if (data.invoice.status !== 'paid' || !data.invoice.payment) {
    throw new Error('a receipt can only be made for a paid invoice');
  }
  // Try the full description first, and shorten it only as much as the page forces.
  for (let lines = MAX_DESCRIPTION_LINES; lines >= MIN_DESCRIPTION_LINES; lines--) {
    try {
      return layout(data, lines);
    } catch (error) {
      if (!(error instanceof DoesNotFit)) throw error;
    }
  }
  throw new Error('receipt does not fit on one page');
}

function layout(data: ReceiptData, descriptionLines: number): Buffer {
  const { invoice, cluster, utcOffsetMinutes } = data;
  const payment = invoice.payment!;
  const decimals = invoice.asset.decimals;
  const symbol = invoice.asset.symbol;
  const explorerUrl = explorerTxUrl(payment.signature, cluster);
  const network = cluster === 'devnet' ? 'Solana devnet (test network)' : 'Solana';

  const page = new PdfPage(WIDTH, HEIGHT);
  /** Converts a distance from the top of the page into a PDF y coordinate. */
  const y = (top: number) => HEIGHT - top;
  let top = MARGIN;

  // ---- Header ----------------------------------------------------------------------------------
  page.text('Quitado', MARGIN, y(top + 10), { font: 'bold', size: 12, color: MUTED });
  top += 44;
  page.text('Payment receipt', MARGIN, y(top), { font: 'bold', size: 24, color: INK });
  top += 14;
  page.line(MARGIN, y(top), WIDTH - MARGIN, y(top), { color: RULE });
  top += 30;

  // ---- Status and amount -----------------------------------------------------------------------
  const badgeWidth = textWidth('PAID', 'bold', 10) + 20;
  page.rect(MARGIN, y(top + 6), badgeWidth, 20, GREEN_BG);
  page.text('PAID', MARGIN + 10, y(top), { font: 'bold', size: 10, color: GREEN });
  top += 40;
  page.text(`${displayAmount(payment.amount, decimals)} ${symbol}`, MARGIN, y(top), {
    font: 'bold',
    size: 28,
    color: INK,
  });
  top += 22;
  if (payment.amount !== invoice.amount) {
    page.text(
      `Invoice amount: ${displayAmount(invoice.amount, decimals)} ${symbol}`,
      MARGIN,
      y(top),
      { size: 10, color: MUTED },
    );
    top += 18;
  }
  top += 14;

  // ---- Details ---------------------------------------------------------------------------------
  const row = (
    label: string,
    value: string,
    options: { font?: Font; size?: number; maxLines?: number } = {},
  ): void => {
    const { font = 'regular', size = 10.5, maxLines = Infinity } = options;
    let lines = wrapText(value, font, size, VALUE_WIDTH);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = ellipsize(lines[maxLines - 1]!, font, size, VALUE_WIDTH);
    }
    const leading = size + 3.5;
    page.text(label.toUpperCase(), MARGIN, y(top), { font: 'bold', size: 7.5, color: MUTED });
    lines.forEach((line, index) => {
      page.text(line, VALUE_X, y(top + index * leading), { font, size, color: INK });
    });
    top += lines.length * leading + 9;
  };

  if (data.ownerName) row('From', data.ownerName, { maxLines: NAME_LINES });
  row('Received at', data.recipient, { font: 'mono', size: 8.5 });
  row('Billed to', invoice.clientName, { maxLines: NAME_LINES });
  row('Description', invoice.description, { maxLines: descriptionLines });
  row('Invoice date', formatDate(invoice.createdAt, utcOffsetMinutes));
  row('Due date', formatDate(invoice.dueAt, utcOffsetMinutes));
  row('Payment received', formatDateTime(payment.receivedAt, utcOffsetMinutes));
  if (payment.payer) row('Paid from', payment.payer, { font: 'mono', size: 8.5 });
  row('Network', network);
  row('Token', `${symbol}  (${invoice.asset.mint})`, { font: 'mono', size: 8.5 });
  row('Transaction', payment.signature, { font: 'mono', size: 8.5 });

  // ---- Verification: link and QR code --------------------------------------------------------
  top += 4;
  page.line(MARGIN, y(top), WIDTH - MARGIN, y(top), { color: RULE });
  top += 22;
  page.text('Verify this payment on the blockchain', MARGIN, y(top), {
    font: 'bold',
    size: 11,
    color: INK,
  });
  top += 14;

  const qrSize = 104;
  const qrTop = top;
  drawQr(page, explorerUrl, MARGIN, qrTop, qrSize);

  const textX = MARGIN + qrSize + 18;
  const textWidthAvailable = WIDTH - MARGIN - textX;
  let linkTop = qrTop + 8;
  page.text('Scan the code or open this address in a browser:', textX, y(linkTop), {
    size: 9.5,
    color: MUTED,
  });
  linkTop += 16;
  for (const line of wrapText(explorerUrl, 'mono', 7.5, textWidthAvailable)) {
    page.text(line, textX, y(linkTop), { font: 'mono', size: 7.5, color: BLUE });
    page.link(textX, y(linkTop + 2), textWidth(line, 'mono', 7.5), 10, explorerUrl);
    linkTop += 11;
  }
  top = Math.max(top + qrSize, linkTop) + 8;

  if (top > FOOTER_TOP) throw new DoesNotFit();

  // ---- Footer ----------------------------------------------------------------------------------
  page.line(MARGIN, y(FOOTER_TOP), WIDTH - MARGIN, y(FOOTER_TOP), { color: RULE });
  let footer = FOOTER_TOP + 16;
  const note =
    'This receipt records a payment made on the Solana blockchain. It is not a tax document ' +
    '(nota fiscal) and does not replace one.';
  for (const line of wrapText(note, 'regular', 8, WIDTH - MARGIN * 2)) {
    page.text(line, MARGIN, y(footer), { size: 8, color: MUTED });
    footer += 11;
  }
  page.text(
    `Invoice ${invoice.id}  -  generated by Quitado on ${formatDateTime(data.generatedAt, utcOffsetMinutes)}`,
    MARGIN,
    y(footer + 2),
    { size: 8, color: MUTED },
  );

  return renderPdf(page, {
    title: `Payment receipt ${invoice.id}`,
    created: new Date(data.generatedAt),
  });
}

/** Draws a QR code as vector squares, merging horizontal runs to keep the file small. */
function drawQr(page: PdfPage, text: string, left: number, top: number, size: number): void {
  const code = generate(text, { minCorrectionLevel: correction.M });
  const quiet = 4; // modules of empty border, as the QR specification asks
  const cell = size / (code.size + quiet * 2);
  const squares: [number, number, number, number][] = [];
  for (let row = 0; row < code.size; row++) {
    let column = 0;
    while (column < code.size) {
      if (!code.get(column, row)) {
        column++;
        continue;
      }
      const start = column;
      while (column < code.size && code.get(column, row)) column++;
      squares.push([
        left + (quiet + start) * cell,
        HEIGHT - (top + (quiet + row + 1) * cell),
        (column - start) * cell,
        cell,
      ]);
    }
  }
  page.rects(squares, [0, 0, 0]); // one fill: no seams between neighbouring modules
}
