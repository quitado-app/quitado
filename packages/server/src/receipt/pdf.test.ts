import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodeWinAnsi, PdfPage, renderPdf, textWidth, wrapText } from './pdf.ts';

const CREATED = new Date(Date.UTC(2026, 10, 2, 15, 30, 5));

function build(configure: (page: PdfPage) => void): Buffer {
  const page = new PdfPage(595, 842);
  configure(page);
  return renderPdf(page, { title: 'Test document', created: CREATED });
}

/** Reads the file the way a PDF reader would: through the xref table, never by searching. */
function parse(pdf: Buffer) {
  const text = pdf.toString('latin1');
  const startxref = /startxref\n(\d+)\n%%EOF\n$/.exec(text);
  if (!startxref) throw new Error('missing startxref/%%EOF at the end');
  const xrefAt = Number(startxref[1]);
  expect(text.slice(xrefAt, xrefAt + 5)).toBe('xref\n');

  const header = /xref\n0 (\d+)\n/.exec(text.slice(xrefAt))!;
  const count = Number(header[1]);
  const entriesStart = xrefAt + header[0].length;
  const entries: { offset: number; kind: string }[] = [];
  for (let i = 0; i < count; i++) {
    const entry = text.slice(entriesStart + i * 20, entriesStart + (i + 1) * 20);
    expect(entry).toMatch(/^\d{10} \d{5} [fn] \n$/); // exactly 20 bytes each
    entries.push({ offset: Number(entry.slice(0, 10)), kind: entry[17]! });
  }
  const objects = new Map<number, string>();
  for (let id = 1; id < count; id++) {
    const { offset } = entries[id]!;
    expect(text.slice(offset, offset + `${id} 0 obj\n`.length)).toBe(`${id} 0 obj\n`);
    objects.set(id, text.slice(offset, text.indexOf('\nendobj\n', offset)));
  }
  return { text, count, entries, objects };
}

function contentOf(pdf: Buffer): string {
  const { text, objects } = parse(pdf);
  const object = objects.get(4)!;
  const declared = Number(/\/Length (\d+)/.exec(object)![1]);
  const start = text.indexOf('stream\n', text.indexOf(object)) + 'stream\n'.length;
  const data = pdf.subarray(start, start + declared);
  // The declared length must end exactly at endstream.
  expect(
    pdf.subarray(start + declared, start + declared + '\nendstream'.length).toString('latin1'),
  ).toBe('\nendstream');
  return inflateSync(data).toString('latin1');
}

describe('renderPdf structure', () => {
  const pdf = build((page) => page.text('Hello', 50, 700));

  it('has a header, a binary marker and an end-of-file marker', () => {
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(pdf[10]).toBeGreaterThan(127); // binary comment so transports treat the file as binary
    expect(pdf.toString('latin1').endsWith('%%EOF\n')).toBe(true);
  });

  it('has an exact cross-reference table: every offset lands on its object', () => {
    const { count, entries, objects } = parse(pdf);
    expect(count).toBe(9); // free entry + 8 objects
    expect(entries[0]).toEqual({ offset: 0, kind: 'f' });
    expect(objects.size).toBe(8);
  });

  it('links the catalog, pages, page, content, fonts and info together', () => {
    const { objects, text } = parse(pdf);
    expect(objects.get(1)).toContain('/Type /Catalog /Pages 2 0 R');
    expect(objects.get(2)).toContain('/Kids [3 0 R] /Count 1');
    expect(objects.get(3)).toContain('/MediaBox [0 0 595 842]');
    expect(objects.get(3)).toContain('/Contents 4 0 R');
    expect(objects.get(5)).toContain('/BaseFont /Helvetica /Encoding /WinAnsiEncoding');
    expect(objects.get(6)).toContain('/BaseFont /Helvetica-Bold');
    expect(objects.get(7)).toContain('/BaseFont /Courier');
    expect(objects.get(8)).toContain('/Title (Test document)');
    expect(text).toContain('/Root 1 0 R /Info 8 0 R');
  });

  it('writes the creation date in UTC', () => {
    expect(parse(pdf).objects.get(8)).toContain('/CreationDate (D:20261102153005Z)');
  });

  it('declares a stream length that matches the compressed bytes', () => {
    expect(contentOf(pdf)).toContain('(Hello) Tj');
  });
});

describe('drawing operations', () => {
  it('draws text with font, size, color and position', () => {
    const content = contentOf(
      build((page) => page.text('Total', 72, 600, { font: 'bold', size: 14, color: [0, 0.5, 0] })),
    );
    expect(content).toBe('BT 0 0.5 0 rg /F2 14 Tf 1 0 0 1 72 600 Tm (Total) Tj ET');
  });

  it('draws rectangles and lines', () => {
    const content = contentOf(
      build((page) => {
        page.rect(10, 20, 30.456, 40, [1, 0, 0]);
        page.line(0, 5, 100, 5, { width: 1, color: [0, 0, 1] });
      }),
    );
    expect(content).toContain('1 0 0 rg 10 20 30.46 40 re f');
    expect(content).toContain('1 w 0 0 1 RG 0 5 m 100 5 l S');
  });

  it('fills many rectangles as one path, and does nothing for an empty list', () => {
    const content = contentOf(
      build((page) => {
        page.rects(
          [
            [0, 0, 10, 10],
            [10, 0, 10, 10],
          ],
          [0, 0, 0],
        );
        page.rects([], [1, 0, 0]);
      }),
    );
    expect(content).toBe('0 0 0 rg 0 0 10 10 re 10 0 10 10 re f');
  });

  it('adds link annotations that point at the URL', () => {
    const pdf = build((page) =>
      page.link(50, 100, 200, 12, 'https://explorer.solana.com/tx/abc?cluster=devnet'),
    );
    const { objects } = parse(pdf);
    expect(objects.get(3)).toContain('/Annots [9 0 R]');
    expect(objects.get(9)).toContain('/Subtype /Link');
    expect(objects.get(9)).toContain('/Rect [50 100 250 112]');
    expect(objects.get(9)).toContain('/URI (https://explorer.solana.com/tx/abc?cluster=devnet)');
    expect(parse(pdf).count).toBe(10);
  });

  it('refuses links that are not plain http(s) URLs', () => {
    const page = new PdfPage(100, 100);
    expect(() => page.link(0, 0, 1, 1, 'javascript:alert(1)')).toThrow();
    expect(() => page.link(0, 0, 1, 1, 'https://a.com/ü')).toThrow();
    expect(() => page.link(0, 0, 1, 1, 'https://a.com/a b')).toThrow();
  });
});

describe('text encoding', () => {
  it('escapes the characters that would break a PDF string', () => {
    const content = contentOf(build((page) => page.text('a(b)c\\d', 0, 0)));
    expect(content).toContain('(a\\(b\\)c\\\\d) Tj');
  });

  it('encodes accented Latin letters as WinAnsi octal bytes', () => {
    const content = contentOf(build((page) => page.text('João Conceição', 0, 0)));
    expect(content).toContain('(Jo\\343o Concei\\347\\343o) Tj');
  });

  it('keeps euro, dashes and curly quotes', () => {
    expect([...encodeWinAnsi('€ – — “x” ’ …')]).toEqual([
      0x80, 0x20, 0x96, 0x20, 0x97, 0x20, 0x93, 0x78, 0x94, 0x20, 0x92, 0x20, 0x85,
    ]);
  });

  it('draws what WinAnsi cannot express as a question mark, one per character', () => {
    expect(encodeWinAnsi('株式 😀').toString('latin1')).toBe('?? ?');
  });

  it('turns tabs and newlines into spaces and control characters into ?', () => {
    expect(encodeWinAnsi('a\tb\nc\u0001').toString('latin1')).toBe('a b c?');
  });

  it('never leaks input into the PDF structure', () => {
    const hostile = ') Tj ET 0 0 m (';
    const content = contentOf(build((page) => page.text(hostile, 0, 0)));
    expect(content).toBe('BT 0 0 0 rg /F1 11 Tf 1 0 0 1 0 0 Tm (\\) Tj ET 0 0 m \\() Tj ET');
  });
});

describe('text measuring and wrapping', () => {
  it('measures with the real Helvetica metrics', () => {
    // H=722 e=556 l=222 l=222 o=556 -> 2278/1000 em
    expect(textWidth('Hello', 'regular', 10)).toBeCloseTo(22.78);
    expect(textWidth('Hello', 'bold', 10)).toBeGreaterThan(textWidth('Hello', 'regular', 10));
    expect(textWidth('abcdef', 'mono', 10)).toBeCloseTo(36);
    expect(textWidth('', 'regular', 10)).toBe(0);
  });

  it('measures accented letters like their base letter', () => {
    expect(textWidth('é', 'regular', 10)).toBe(textWidth('e', 'regular', 10));
    expect(textWidth('Ç', 'bold', 10)).toBe(textWidth('C', 'bold', 10));
  });

  it('wraps at word boundaries and keeps every line within the width', () => {
    const text =
      'Website redesign for the autumn campaign, including the landing page and checkout';
    const lines = wrapText(text, 'regular', 11, 150);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join(' ')).toBe(text);
    for (const line of lines) expect(textWidth(line, 'regular', 11)).toBeLessThanOrEqual(150);
  });

  it('cuts a token that is wider than a whole line, such as a transaction signature', () => {
    const signature =
      '5Spv3aP5j9tn1kYedJotScgVDArCLwejhC4HXBLZBDMP8aPmTK2URVSxF8vgFpXfHd5LRDxptJVjg24BHEZtLHe4';
    const lines = wrapText(signature, 'mono', 9, 240);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(signature);
    for (const line of lines) expect(textWidth(line, 'mono', 9)).toBeLessThanOrEqual(240);
  });

  it('keeps paragraph breaks and returns one empty line for empty text', () => {
    expect(wrapText('one\ntwo', 'regular', 11, 500)).toEqual(['one', 'two']);
    expect(wrapText('', 'regular', 11, 500)).toEqual(['']);
    expect(wrapText('   ', 'regular', 11, 500)).toEqual(['']);
  });
});
