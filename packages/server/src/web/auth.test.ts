import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createAuth, createRateLimiter } from './auth.ts';
import { isSameOrigin, parseCookies, parseForm, serializeCookie } from './http-utils.ts';

const SECRET = 'a-long-enough-secret-value-1234';
const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

describe('createAuth', () => {
  const auth = createAuth(SECRET);

  it('accepts only the exact secret', () => {
    expect(auth.verifySecret(SECRET)).toBe(true);
    expect(auth.verifySecret(`${SECRET} `)).toBe(false);
    expect(auth.verifySecret(SECRET.toUpperCase())).toBe(false);
    expect(auth.verifySecret('')).toBe(false);
    expect(auth.verifySecret('x'.repeat(10_000))).toBe(false);
  });

  it('creates sessions that verify until they expire', () => {
    const { value, maxAgeSeconds } = auth.createSession(NOW);
    expect(maxAgeSeconds).toBe(12 * 3600);
    expect(auth.verifySession(value, NOW)).toBe(true);
    expect(auth.verifySession(value, NOW + 11 * HOUR)).toBe(true);
    expect(auth.verifySession(value, NOW + 12 * HOUR)).toBe(false);
    expect(auth.verifySession(value, NOW + 13 * HOUR)).toBe(false);
  });

  it('gives every session a different value', () => {
    expect(auth.createSession(NOW).value).not.toBe(auth.createSession(NOW).value);
  });

  it('rejects tampered, truncated and garbage cookies', () => {
    const { value } = auth.createSession(NOW);
    const [version, expires, nonce, signature] = value.split('.') as [
      string,
      string,
      string,
      string,
    ];
    expect(
      auth.verifySession(`${version}.${Number(expires) + HOUR}.${nonce}.${signature}`, NOW),
    ).toBe(false);
    expect(auth.verifySession(`${version}.${expires}.${nonce}.${signature.slice(1)}x`, NOW)).toBe(
      false,
    );
    expect(auth.verifySession(`v2.${expires}.${nonce}.${signature}`, NOW)).toBe(false);
    expect(auth.verifySession(`${version}.${expires}.${nonce}`, NOW)).toBe(false);
    expect(auth.verifySession(`${version}.nan.${nonce}.${signature}`, NOW)).toBe(false);
    expect(auth.verifySession('', NOW)).toBe(false);
    expect(auth.verifySession(undefined, NOW)).toBe(false);
    expect(auth.verifySession('....', NOW)).toBe(false);
  });

  it('rejects a session signed with a different secret', () => {
    const other = createAuth('another-long-enough-secret-9999');
    expect(auth.verifySession(other.createSession(NOW).value, NOW)).toBe(false);
  });

  it('rejects an expiry further in the future than a session can last', () => {
    const long = createAuth(SECRET, { sessionTtlMs: 100 * HOUR });
    expect(auth.verifySession(long.createSession(NOW).value, NOW)).toBe(false);
  });
});

describe('createRateLimiter', () => {
  it('allows up to max attempts per window, then blocks with a retry time', () => {
    let now = NOW;
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: () => now });
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(true);
    now += 10_000;
    expect(limiter.take('a')).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it('tracks keys separately and recovers after the window', () => {
    let now = NOW;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => now });
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
    expect(limiter.take('b').allowed).toBe(true);
    now += 1000;
    expect(limiter.take('a').allowed).toBe(true);
  });

  it('does not extend the block when blocked attempts keep coming', () => {
    let now = NOW;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => now });
    limiter.take('a');
    now += 500;
    expect(limiter.take('a').allowed).toBe(false);
    now += 500;
    expect(limiter.take('a').allowed).toBe(true);
  });
});

describe('http utils', () => {
  it('parses cookies', () => {
    const cookies = parseCookies('a=1; quitado_session=abc.def; b=x=y');
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('quitado_session')).toBe('abc.def');
    expect(cookies.get('b')).toBe('x=y');
    expect(parseCookies(undefined).size).toBe(0);
    expect(parseCookies('garbage').size).toBe(0);
  });

  it('keeps the first value when a cookie name repeats', () => {
    expect(parseCookies('a=1; a=2').get('a')).toBe('1');
  });

  it('serializes a locked-down cookie', () => {
    expect(serializeCookie('s', 'v', { maxAgeSeconds: 60, secure: false })).toBe(
      's=v; Path=/; Max-Age=60; HttpOnly; SameSite=Strict',
    );
    expect(serializeCookie('s', 'v', { maxAgeSeconds: 60, secure: true })).toContain('; Secure');
  });

  it('accepts only same-origin writes', () => {
    const request = (headers: Record<string, string>) =>
      ({ headers }) as unknown as IncomingMessage;
    const base = 'https://pay.example.com';
    expect(isSameOrigin(request({ origin: base }), base)).toBe(true);
    expect(isSameOrigin(request({ origin: 'https://evil.example' }), base)).toBe(false);
    expect(isSameOrigin(request({ origin: 'null' }), base)).toBe(false);
    expect(isSameOrigin(request({ referer: `${base}/admin/invoices/new` }), base)).toBe(true);
    expect(isSameOrigin(request({ referer: 'https://evil.example/x' }), base)).toBe(false);
    expect(isSameOrigin(request({ referer: 'not a url' }), base)).toBe(false);
    expect(isSameOrigin(request({}), base)).toBe(false);
  });

  it('parses forms with the last value winning', () => {
    expect(Object.fromEntries(parseForm('a=1&b=x+y&b=%26'))).toEqual({ a: '1', b: '&' });
  });
});
