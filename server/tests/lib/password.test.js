import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';

describe('password hashing', () => {
  it('returns a bcrypt hash and not the plaintext', async () => {
    const hash = await hashPassword('correct-horse');

    expect(hash).toMatch(/^\$2[ab]\$/);
    expect(hash).not.toBe('correct-horse');
  });

  it('uses a new salt for each hash', async () => {
    const first = await hashPassword('correct-horse');
    const second = await hashPassword('correct-horse');

    expect(first).not.toBe(second);
  });

  it('accepts the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct-horse');

    expect(await verifyPassword('correct-horse', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
