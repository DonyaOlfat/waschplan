import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createSessionToken,
  hashSessionToken,
  SESSION_TTL_MS,
  sessionCookieOptions,
} from '../../src/lib/session.js';

describe('session tokens', () => {
  it('stores the sha256 hash and not the raw token', () => {
    const token = createSessionToken();
    const hash = hashSessionToken(token);

    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
  });

  it('sets an httpOnly lax cookie, secure only in production', () => {
    expect(sessionCookieOptions('test')).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
    expect(sessionCookieOptions('development').secure).toBe(false);
    expect(sessionCookieOptions('production').secure).toBe(true);
  });
});
