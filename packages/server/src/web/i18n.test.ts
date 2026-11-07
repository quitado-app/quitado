import { describe, expect, it } from 'vitest';
import { formError, LANGS, messages, pickLang, t } from './i18n.ts';

describe('formError', () => {
  it('shows the core message as written in English, with a capital letter', () => {
    expect(formError('en', 'client name is required')).toBe('Client name is required');
    expect(formError('en', 'invalid amount: "abc"')).toBe('Invalid amount: "abc"');
  });

  it('translates what the owner can get wrong in Portuguese, and leaves the rest as it is', () => {
    expect(formError('pt-BR', 'too many decimal places (max 6): 1.1234567')).toBe(
      'Casas decimais demais: o máximo permitido é 6.',
    );
    expect(formError('pt-BR', 'unsupported asset: XYZ')).toBe('Este token não é aceito.');
    expect(formError('pt-BR', 'something the core said later')).toBe(
      'Something the core said later',
    );
  });
});

describe('pickLang', () => {
  it('defaults to English', () => {
    expect(pickLang(null)).toBe('en');
    expect(pickLang(undefined, undefined)).toBe('en');
    expect(pickLang('', '')).toBe('en');
  });

  it('accepts ?lang= in a few spellings', () => {
    expect(pickLang('pt')).toBe('pt-BR');
    expect(pickLang('pt-BR')).toBe('pt-BR');
    expect(pickLang('PT-br')).toBe('pt-BR');
    expect(pickLang('en')).toBe('en');
    expect(pickLang('en-GB')).toBe('en');
  });

  it('lets an explicit choice win over the browser', () => {
    expect(pickLang('en', 'pt-BR,pt;q=0.9')).toBe('en');
    expect(pickLang('pt', 'en-US,en;q=0.9')).toBe('pt-BR');
  });

  it('ignores a language it does not have and falls back to the browser, then English', () => {
    expect(pickLang('fr', 'pt-BR')).toBe('pt-BR');
    expect(pickLang('fr', 'de,fr;q=0.8')).toBe('en');
    expect(pickLang('xx', undefined)).toBe('en');
  });

  it('reads Accept-Language by quality, with the first listed winning a tie', () => {
    expect(pickLang(null, 'pt-BR,pt;q=0.9,en;q=0.8')).toBe('pt-BR');
    expect(pickLang(null, 'en;q=0.5,pt;q=0.9')).toBe('pt-BR');
    expect(pickLang(null, 'en,pt')).toBe('en');
    expect(pickLang(null, 'pt-PT')).toBe('pt-BR');
    expect(pickLang(null, 'de, en-US;q=0.7, pt;q=0.6')).toBe('en');
  });

  it('skips languages the browser refuses and survives malformed headers', () => {
    expect(pickLang(null, 'pt;q=0,en;q=0.5')).toBe('en');
    expect(pickLang(null, 'pt;q=abc')).toBe('pt-BR'); // an unreadable weight counts as the default
    expect(pickLang(null, ';;;,,,;q=')).toBe('en');
    // Only the first 20 entries are read, so a huge header cannot cost much.
    expect(pickLang(null, `${'x,'.repeat(5000)}pt`)).toBe('en');
  });
});

describe('messages', () => {
  const keys = (lang: (typeof LANGS)[number]) => Object.keys(messages[lang]).sort();
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('has the same keys in every language', () => {
    for (const lang of LANGS) expect(keys(lang)).toEqual(keys('en'));
  });

  it('uses the same placeholders in every language, and never leaves a message empty', () => {
    for (const key of Object.keys(messages.en) as (keyof typeof messages.en)[]) {
      for (const lang of LANGS) {
        const text = messages[lang][key];
        expect(text.trim(), `${lang}.${key}`).not.toBe('');
        expect(placeholders(text), `${lang}.${key}`).toEqual(placeholders(messages.en[key]));
      }
    }
  });

  it('contains no markup, so a message can never inject HTML', () => {
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(messages[lang])) {
        expect(text, `${lang}.${key}`).not.toMatch(/[<>]/);
      }
    }
  });

  it('fills placeholders and leaves an unknown one visible', () => {
    expect(t('en', 'invoiceFrom', { issuer: 'Acme' })).toBe('Invoice from Acme');
    expect(t('pt-BR', 'invoiceFrom', { issuer: 'Acme' })).toBe('Fatura de Acme');
    expect(t('en', 'invoiceFrom')).toBe('Invoice from {issuer}');
  });
});
