import { describe, expect, it } from 'vitest';
import { displayAmount, endOfDay, explorerTxUrl, formatDate, shorten } from './format.ts';
import { escapeHtml, html, raw } from './html.ts';

describe('html templating', () => {
  it('escapes interpolated text by default', () => {
    const value = `<script>alert("x")</script> & 'q'`;
    expect(html`<p>${value}</p>`.value).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;</p>',
    );
  });

  it('escapes inside attributes so a value cannot break out of the quotes', () => {
    expect(html`<input value="${'" onfocus="alert(1)'}" />`.value).toBe(
      '<input value="&quot; onfocus=&quot;alert(1)" />',
    );
  });

  it('does not escape nested templates or explicit raw markup', () => {
    const inner = html`<b>${'<i>'}</b>`;
    expect(html`<p>${inner}</p>`.value).toBe('<p><b>&lt;i&gt;</b></p>');
    expect(html`<p>${raw('<svg/>')}</p>`.value).toBe('<p><svg/></p>');
  });

  it('renders arrays, and drops null, undefined and false', () => {
    expect(html`${[html`<a>${'1'}</a>`, '<b>']}`.value).toBe('<a>1</a>&lt;b&gt;');
    expect(html`[${null}${undefined}${false}]`.value).toBe('[]');
    expect(html`${0}`.value).toBe('0');
  });

  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('format', () => {
  it('displays amounts exactly, with at least two decimals and thousands separators', () => {
    expect(displayAmount(12_500_000n, 6)).toBe('12.50');
    expect(displayAmount(1_250_000_000n, 6)).toBe('1,250.00');
    expect(displayAmount(1n, 6)).toBe('0.000001');
    expect(displayAmount(0n, 6)).toBe('0.00');
    expect(displayAmount(999_999_999_999_999n, 6)).toBe('999,999,999.999999');
    expect(displayAmount(5n, 0)).toBe('5.00');
  });

  it('displays amounts the Brazilian way in Portuguese', () => {
    expect(displayAmount(1_250_500_000n, 6, 'pt-BR')).toBe('1.250,50');
    expect(displayAmount(12_500_000n, 6, 'pt-BR')).toBe('12,50');
    expect(displayAmount(1n, 6, 'pt-BR')).toBe('0,000001');
    expect(displayAmount(999_999_999_999_999n, 6, 'pt-BR')).toBe('999.999.999,999999');
    expect(displayAmount(1_250_500_000n, 6, 'en')).toBe('1,250.50');
  });

  it('formats dates day first in Portuguese', () => {
    const ms = Date.UTC(2026, 10, 3, 1, 30);
    expect(formatDate(ms, -180, 'pt-BR')).toBe('02/11/2026');
    expect(formatDate(ms, 0, 'pt-BR')).toBe('03/11/2026');
    expect(formatDate(ms, 0, 'en')).toBe('2026-11-03');
  });

  it('formats dates in the instance UTC offset', () => {
    const ms = Date.UTC(2026, 10, 3, 1, 30); // 01:30 UTC on 3 Nov
    expect(formatDate(ms, 0)).toBe('2026-11-03');
    expect(formatDate(ms, -180)).toBe('2026-11-02'); // still the 2nd in Brasilia
  });

  it('turns a date into the last second of that day in the offset', () => {
    expect(endOfDay('2026-11-03', 0)).toBe(Date.UTC(2026, 10, 3, 23, 59, 59));
    expect(endOfDay('2026-11-03', -180)).toBe(Date.UTC(2026, 10, 4, 2, 59, 59));
    expect(formatDate(endOfDay('2026-11-03', -180)!, -180)).toBe('2026-11-03');
  });

  it.each(['', '2026-13-01', '2026-02-30', '2026-1-1', '03/11/2026', '2026-11-03T10:00', 'x'])(
    'rejects the date %j',
    (date) => {
      expect(endOfDay(date, 0)).toBeUndefined();
    },
  );

  it('builds explorer links, marking devnet', () => {
    expect(explorerTxUrl('abc', 'mainnet-beta')).toBe('https://explorer.solana.com/tx/abc');
    expect(explorerTxUrl('abc', 'devnet')).toBe(
      'https://explorer.solana.com/tx/abc?cluster=devnet',
    );
    expect(explorerTxUrl('a/b?c', 'devnet')).toContain('a%2Fb%3Fc');
  });

  it('shortens long text in the middle', () => {
    expect(shorten('E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL')).toBe('E2pDM…FbQxL');
    expect(shorten('short')).toBe('short');
  });
});
