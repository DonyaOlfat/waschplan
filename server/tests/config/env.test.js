import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const DATABASE_URL = 'postgresql://waschplan:waschplan@localhost:5432/waschplan_dev';

describe('loadEnv', () => {
  it('uses defaults when only DATABASE_URL is set', () => {
    expect(loadEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
    });
  });

  it('coerces PORT to a number', () => {
    expect(loadEnv({ DATABASE_URL, PORT: '4000' }).PORT).toBe(4000);
  });

  it('throws when PORT is not a number', () => {
    expect(() => loadEnv({ DATABASE_URL, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('throws when NODE_ENV is not allowed', () => {
    expect(() => loadEnv({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a postgres url', () => {
    expect(() => loadEnv({ DATABASE_URL: 'http://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(loadEnv({ DATABASE_URL }))).toBe(true);
  });
});
