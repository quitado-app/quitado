import type { IncomingMessage } from 'node:http';

export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!cookies.has(name)) cookies.set(name, part.slice(index + 1).trim());
  }
  return cookies;
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAgeSeconds: number; secure: boolean },
): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${options.maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * CSRF defense for state-changing requests, on top of SameSite=Strict: the browser-sent Origin
 * (or, failing that, Referer) must be this instance. A request with neither is refused.
 */
export function isSameOrigin(request: IncomingMessage, baseUrl: string): boolean {
  const origin = request.headers.origin;
  if (typeof origin === 'string') return origin === baseUrl;
  const referer = request.headers.referer;
  if (typeof referer === 'string') {
    try {
      return new URL(referer).origin === baseUrl;
    } catch {
      return false;
    }
  }
  return false;
}

export class BodyTooLargeError extends Error {
  override name = 'BodyTooLargeError';
}

/** Reads a request body as text, refusing anything above `limitBytes`. */
export async function readBody(request: IncomingMessage, limitBytes: number): Promise<string> {
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > limitBytes)
    throw new BodyTooLargeError('body too large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > limitBytes) throw new BodyTooLargeError('body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Parses an application/x-www-form-urlencoded body into a plain map (last value wins). */
export function parseForm(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(body)) fields.set(key, value);
  return fields;
}
