import { describe, expect, it } from 'vitest';
import { trustProxySetting } from '../../src/lib/trust-proxy.js';

describe('trustProxySetting', () => {
  it('returns 1 in production', () => {
    expect(trustProxySetting('production')).toBe(1);
  });

  it('returns undefined in test', () => {
    expect(trustProxySetting('test')).toBeUndefined();
  });

  it('returns undefined in development', () => {
    expect(trustProxySetting('development')).toBeUndefined();
  });
});
