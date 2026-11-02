// Single-owner authentication: one secret from the environment, no accounts, no database.
// A session is a signed, expiring cookie (stateless), so changing the secret signs everyone out.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface Auth {
  /** Constant-time check of the typed secret. */
  verifySecret(candidate: string): boolean;
  createSession(now: number): { value: string; maxAgeSeconds: number };
  verifySession(value: string | undefined, now: number): boolean;
}

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
const VERSION = 'v1';

const sha256 = (text: string) => createHash('sha256').update(text).digest();

export function createAuth(secret: string, options: { sessionTtlMs?: number } = {}): Auth {
  const ttlMs = options.sessionTtlMs ?? DEFAULT_TTL_MS;
  // The signing key is derived, so the raw secret is never used directly as an HMAC key.
  const key = createHmac('sha256', secret).update('quitado-session-key').digest();
  const secretDigest = sha256(secret);

  const sign = (payload: string) => createHmac('sha256', key).update(payload).digest('base64url');

  return {
    verifySecret(candidate) {
      // Comparing fixed-length digests keeps the comparison constant-time whatever was typed.
      return timingSafeEqual(sha256(candidate), secretDigest);
    },

    createSession(now) {
      const payload = `${VERSION}.${now + ttlMs}.${randomBytes(16).toString('base64url')}`;
      return { value: `${payload}.${sign(payload)}`, maxAgeSeconds: Math.floor(ttlMs / 1000) };
    },

    verifySession(value, now) {
      if (!value) return false;
      const parts = value.split('.');
      if (parts.length !== 4 || parts[0] !== VERSION) return false;
      const [version, expiresText, nonce, signature] = parts as [string, string, string, string];
      const expiresAt = Number(expiresText);
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt - now > ttlMs) {
        return false;
      }
      const expected = Buffer.from(sign(`${version}.${expiresText}.${nonce}`));
      const given = Buffer.from(signature);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
  };
}

export interface RateLimiter {
  /** Records an attempt for `key` and says whether it is within the limit. */
  take(key: string): { allowed: boolean; retryAfterSeconds: number };
}

const MAX_TRACKED_KEYS = 10_000;

/** Sliding-window limiter kept in memory: enough for one self-hosted instance. */
export function createRateLimiter(options: {
  max: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const { max, windowMs, now = Date.now } = options;
  const attempts = new Map<string, number[]>();

  return {
    take(key) {
      const current = now();
      if (attempts.size > MAX_TRACKED_KEYS) {
        for (const [tracked, times] of attempts) {
          if (times.every((time) => current - time >= windowMs)) attempts.delete(tracked);
        }
      }
      const recent = (attempts.get(key) ?? []).filter((time) => current - time < windowMs);
      if (recent.length >= max) {
        attempts.set(key, recent);
        const retryAfter = Math.ceil((recent[0]! + windowMs - current) / 1000);
        return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
      }
      recent.push(current);
      attempts.set(key, recent);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
