import { describe, expect, it } from 'vitest';
import { newInvoiceId, newReference } from './ids.ts';
import { qrSvg } from './qr.ts';

describe('qrSvg', () => {
  it('renders a self-contained SVG with fixed colors', () => {
    const svg = qrSvg('solana:E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL?amount=12.5');
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('#000');
    expect(svg).toContain('#fff');
    expect(svg).not.toMatch(/<script|onload|href=/i);
  });

  it('is deterministic and depends on the input', () => {
    expect(qrSvg('a')).toBe(qrSvg('a'));
    expect(qrSvg('a')).not.toBe(qrSvg('b'));
  });

  it('fits a realistic payment URL in a reasonably small code', () => {
    const url =
      'solana:E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL?amount=1250.5' +
      '&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' +
      '&reference=CWEDDyZExHR2bUgqu6LFqcvGS6ZZWB5MYgetmNZMkJTw&label=Acme%20Inc';
    const size = Number(/viewBox="-2 -2 (\d+) /.exec(qrSvg(url))?.[1]);
    expect(size).toBeGreaterThan(30);
    expect(size).toBeLessThan(90);
  });
});

describe('ids', () => {
  it('creates 128-bit url-safe invoice ids that do not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, newInvoiceId));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('creates valid base58 references that do not repeat', () => {
    const references = new Set(Array.from({ length: 200 }, newReference));
    expect(references.size).toBe(200);
    for (const reference of references) {
      expect(reference).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    }
  });
});
