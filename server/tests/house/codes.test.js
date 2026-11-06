import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { generateInviteCode, INVITE_ALPHABET } from '../../src/modules/house/invite-code.js';
import { allocateSlug, slugifyHouseName } from '../../src/modules/house/slug.js';
import { resetDatabase } from '../helpers/reset-database.js';

describe('slugifyHouseName', () => {
  it('shortens a German street name', () => {
    expect(slugifyHouseName('Wittensteinstraße 12')).toBe('wittensteinstr-12');
    expect(slugifyHouseName('Wittensteinstrasse 12')).toBe('wittensteinstr-12');
    expect(slugifyHouseName('  Wittensteinstraße 12  ')).toBe('wittensteinstr-12');
  });

  it('replaces umlauts and collapses punctuation', () => {
    expect(slugifyHouseName('Müllerstraße')).toBe('muellerstr');
    expect(slugifyHouseName('Großmarkt')).toBe('grossmarkt');
    expect(slugifyHouseName('Haus  12!!')).toBe('haus-12');
    expect(slugifyHouseName('!!!')).toBe('');
  });
});

describe('generateInviteCode', () => {
  it('uses six characters from the invite alphabet', () => {
    expect(INVITE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');

    for (let index = 0; index < 100; index += 1) {
      const code = generateInviteCode();

      expect(code).toHaveLength(6);

      for (const character of code) {
        expect(INVITE_ALPHABET).toContain(character);
      }
    }
  });

  it('returns a fixed code from the injected randomInt', () => {
    expect(generateInviteCode(() => 0)).toBe('AAAAAA');
  });
});

describe('allocateSlug', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns the first free slug', async () => {
    await resetDatabase();

    expect(await allocateSlug(prisma, 'haus')).toBe('haus');

    await prisma.house.create({
      data: { name: 'Haus', slug: 'haus', inviteCode: 'AAAAAA' },
    });
    await prisma.house.create({
      data: { name: 'Haus 2', slug: 'haus-2', inviteCode: 'BBBBBB' },
    });

    expect(await allocateSlug(prisma, 'haus')).toBe('haus-3');
  });
});
