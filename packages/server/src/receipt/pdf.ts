// A minimal PDF writer: one page of text, filled rectangles, lines and link annotations, using the
// standard 14 fonts (nothing is embedded). That is all a receipt needs, so the server gets PDF
// output without a library: pdfkit would add 20 packages and 24 MB, mostly for font embedding,
// images and encryption we do not use.
//
// Text is limited to what the WinAnsi encoding covers (Latin letters with accents, common
// punctuation). Anything else is drawn as "?", which is also what pdfkit does without an embedded
// font. Coordinates are in points with the origin at the bottom left, as in PDF itself.
import { deflateSync } from 'node:zlib';
import {
  COURIER_WIDTH,
  HELVETICA,
  HELVETICA_BOLD,
  HELVETICA_BOLD_EXTRA,
  HELVETICA_EXTRA,
} from './metrics.ts';

export type Font = 'regular' | 'bold' | 'mono';
/** Red, green, blue, each from 0 to 1. */
export type Rgb = readonly [number, number, number];

const BASE_FONT: Record<Font, string> = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  mono: 'Courier',
};
const FONT_RESOURCE: Record<Font, string> = { regular: 'F1', bold: 'F2', mono: 'F3' };

// WinAnsi (Windows-1252) bytes for the characters outside Latin-1 that are worth supporting.
const WIN_ANSI_EXTRA = new Map<number, number>([
  [0x20ac, 0x80], // euro
  [0x2026, 0x85], // ellipsis
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95], // bullet
  [0x2013, 0x96], // en dash
  [0x2014, 0x97], // em dash
]);

/** One byte per character; characters WinAnsi cannot express become "?". */
export function encodeWinAnsi(text: string): Buffer {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code === 0x09 || code === 0x0a || code === 0x0d) bytes.push(0x20);
    else if (code < 0x20 || code === 0x7f) bytes.push(0x3f);
    else if (code <= 0x7e || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else bytes.push(WIN_ANSI_EXTRA.get(code) ?? 0x3f);
  }
  return Buffer.from(bytes);
}

/** A PDF literal string: parentheses and backslashes escaped, awkward bytes as octal. */
function pdfString(bytes: Buffer): string {
  let out = '(';
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(byte);
  }
  return `${out})`;
}

const num = (value: number): string => String(Math.round(value * 100) / 100);
const color = (rgb: Rgb): string => rgb.map((channel) => num(channel)).join(' ');

/** Advance width of one character in 1/1000 em. Accented letters share their base letter's width. */
function charWidth(char: string, font: Font): number {
  if (font === 'mono') return COURIER_WIDTH;
  const table = font === 'bold' ? HELVETICA_BOLD : HELVETICA;
  const extra = (font === 'bold' ? HELVETICA_BOLD_EXTRA : HELVETICA_EXTRA)[char];
  if (extra !== undefined) return extra;
  const base = char.normalize('NFD')[0]!;
  const code = base.codePointAt(0)!;
  if (code >= 32 && code <= 126) return table[code - 32]!;
  return table['?'.codePointAt(0)! - 32]!; // anything else is drawn as a question mark
}

/** Shortens text to fit `maxWidth`, ending it with an ellipsis. */
export function ellipsize(text: string, font: Font, size: number, maxWidth: number): string {
  const kept = [...text];
  while (kept.length > 0 && textWidth(`${kept.join('')}…`, font, size) > maxWidth) kept.pop();
  return `${kept.join('').trimEnd()}…`;
}

export function textWidth(text: string, font: Font, size: number): number {
  let total = 0;
  for (const char of text) total += charWidth(char, font);
  return (total * size) / 1000;
}

/** Breaks text into lines no wider than `maxWidth`, splitting a word only when it cannot fit. */
export function wrapText(text: string, font: Font, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    const flush = () => {
      if (line) lines.push(line);
      line = '';
    };
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, font, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      flush();
      if (textWidth(word, font, size) <= maxWidth) {
        line = word;
        continue;
      }
      // A single token wider than the line (a long signature or address): cut it by characters.
      let piece = '';
      for (const char of word) {
        if (piece && textWidth(piece + char, font, size) > maxWidth) {
          lines.push(piece);
          piece = '';
        }
        piece += char;
      }
      line = piece;
    }
    flush();
  }
  return lines.length > 0 ? lines : [''];
}

interface LinkAnnotation {
  x: number;
  y: number;
  width: number;
  height: number;
  uri: string;
}

export class PdfPage {
  private readonly ops: string[] = [];
  private readonly links: LinkAnnotation[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  text(
    text: string,
    x: number,
    y: number,
    options: { font?: Font; size?: number; color?: Rgb } = {},
  ): void {
    const { font = 'regular', size = 11, color: rgb = [0, 0, 0] } = options;
    this.ops.push(
      `BT ${color(rgb)} rg /${FONT_RESOURCE[font]} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm ` +
        `${pdfString(encodeWinAnsi(text))} Tj ET`,
    );
  }

  rect(x: number, y: number, width: number, height: number, rgb: Rgb): void {
    this.ops.push(`${color(rgb)} rg ${num(x)} ${num(y)} ${num(width)} ${num(height)} re f`);
  }

  /**
   * Many rectangles in one color, filled as a single path. Unlike separate fills, abutting
   * rectangles then leave no hairline seams between them, which matters for a QR code.
   */
  rects(rectangles: readonly (readonly [number, number, number, number])[], rgb: Rgb): void {
    if (rectangles.length === 0) return;
    const path = rectangles
      .map(([x, y, width, height]) => `${num(x)} ${num(y)} ${num(width)} ${num(height)} re`)
      .join(' ');
    this.ops.push(`${color(rgb)} rg ${path} f`);
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: { width?: number; color?: Rgb } = {},
  ): void {
    const { width = 0.5, color: rgb = [0.8, 0.8, 0.8] } = options;
    this.ops.push(
      `${num(width)} w ${color(rgb)} RG ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`,
    );
  }

  /** A clickable area. The URI must be plain ASCII (an http(s) URL). */
  link(x: number, y: number, width: number, height: number, uri: string): void {
    if (!/^https?:\/\/[\x21-\x7e]+$/.test(uri)) throw new Error('link must be an http(s) URL');
    this.links.push({ x, y, width, height, uri });
  }

  /** @internal */
  content(): Buffer {
    return Buffer.from(this.ops.join('\n'), 'latin1');
  }

  /** @internal */
  annotations(): readonly LinkAnnotation[] {
    return this.links;
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function pdfDate(date: Date): string {
  return (
    `D:${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

export interface PdfInfo {
  title: string;
  created: Date;
}

/** Serializes the page into a complete, valid PDF file. */
export function renderPdf(page: PdfPage, info: PdfInfo): Buffer {
  const chunks: Buffer[] = [];
  let length = 0;
  const offsets: number[] = [];
  const push = (data: Buffer | string) => {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'latin1') : data;
    chunks.push(buffer);
    length += buffer.length;
  };
  const object = (id: number, body: Buffer | string) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    push(body);
    push('\nendobj\n');
  };

  // Object numbers: 1 catalog, 2 pages, 3 page, 4 content, 5 to 7 fonts, 8 info, 9 and up links.
  const linkIds = page.annotations().map((_, index) => 9 + index);
  const objectCount = 8 + linkIds.length;

  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R /Lang (en) >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R` +
      (linkIds.length > 0 ? ` /Annots [${linkIds.map((id) => `${id} 0 R`).join(' ')}]` : '') +
      ' >>',
  );

  const compressed = deflateSync(page.content());
  object(
    4,
    Buffer.concat([
      Buffer.from(`<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
      compressed,
      Buffer.from('\nendstream', 'latin1'),
    ]),
  );

  (['regular', 'bold', 'mono'] as const).forEach((font, index) => {
    object(
      5 + index,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONT[font]}` +
        (font === 'mono' ? '' : ' /Encoding /WinAnsiEncoding') +
        ' >>',
    );
  });

  object(
    8,
    `<< /Title ${pdfString(encodeWinAnsi(info.title))} /Producer (Quitado) ` +
      `/CreationDate (${pdfDate(info.created)}) >>`,
  );

  page.annotations().forEach((link, index) => {
    object(
      linkIds[index]!,
      `<< /Type /Annot /Subtype /Link /Border [0 0 0] ` +
        `/Rect [${num(link.x)} ${num(link.y)} ${num(link.x + link.width)} ${num(link.y + link.height)}] ` +
        `/A << /S /URI /URI ${pdfString(Buffer.from(link.uri, 'latin1'))} >> >>`,
    );
  });

  const xrefOffset = length;
  push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id++) {
    push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return Buffer.concat(chunks);
}
