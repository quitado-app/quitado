import { describe, expect, it } from 'vitest';
import { APP_CSS, APP_JS } from './assets.ts';

// WCAG contrast, computed from the colours the stylesheet really declares, in both themes.
function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** color-mix(in srgb, a p%, b): the way the browser blends two hex colours. */
function mix(a: string, b: string, share: number): string {
  const [x, y] = [parseInt(a.slice(1), 16), parseInt(b.slice(1), 16)];
  const part = (shift: number) =>
    Math.round(((x >> shift) & 255) * share + ((y >> shift) & 255) * (1 - share))
      .toString(16)
      .padStart(2, '0');
  return `#${part(16)}${part(8)}${part(0)}`;
}

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1]!, m[2]!]),
  );
}
const light = tokens(/:root \{([^}]*)\}/.exec(APP_CSS)![1]!);
const darkBlock = /prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/.exec(APP_CSS)![1]!;
const themes = { light, dark: { ...light, ...tokens(darkBlock) } } as Record<
  string,
  Record<string, string>
>;

describe.each(['light', 'dark'])('colour contrast in the %s theme', (name) => {
  const c = themes[name]!;
  const need = (pairs: [string, string, number][]) => {
    for (const [fg, bg, minimum] of pairs) {
      expect(contrast(c[fg]!, c[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(minimum);
    }
  };

  it('keeps text readable (4.5:1)', () => {
    need([
      ['text', 'bg', 4.5],
      ['text', 'card', 4.5],
      ['muted', 'bg', 4.5],
      ['muted', 'card', 4.5],
      ['accent', 'bg', 4.5],
      ['accent', 'card', 4.5],
      ['accent-text', 'accent', 4.5],
      ['ok', 'ok-bg', 4.5],
      ['warn', 'warn-bg', 4.5],
      ['bad', 'bad-bg', 4.5],
    ]);
  });

  it('makes the focus ring and the border of a field stand out (3:1)', () => {
    need([
      ['accent', 'bg', 3],
      ['accent', 'card', 3],
    ]);
    const fieldLine = mix(c['muted']!, c['card']!, 0.75);
    expect(contrast(fieldLine, c['card']!), 'field border on card').toBeGreaterThanOrEqual(3);
    expect(contrast(fieldLine, c['bg']!), 'field border on its own fill').toBeGreaterThanOrEqual(3);
  });
});

describe('stylesheet', () => {
  it('shows keyboard focus on everything that can take it', () => {
    expect(APP_CSS).toMatch(/:focus-visible\s*\{\s*outline: 3px solid var\(--accent\)/);
  });

  it('draws field borders with the stronger colour, not the hairline', () => {
    expect(APP_CSS).toMatch(
      /--field-line: color-mix\(in srgb, var\(--muted\) 75%, var\(--card\)\)/,
    );
    expect(APP_CSS).toMatch(/input, select, textarea \{[^}]*border: 1px solid var\(--field-line\)/);
  });

  it('gives owner menu links a 44px target and marks the current one', () => {
    expect(APP_CSS).toMatch(/header\.top nav a[^{]*\{[^}]*min-height: 44px/);
    expect(APP_CSS).toContain('a[aria-current="page"]');
  });

  it('says "Copied" out loud as well as on the button', () => {
    expect(APP_JS).toContain("getElementById('live-status')");
    expect(APP_CSS).toContain('.sr-only');
  });
});
