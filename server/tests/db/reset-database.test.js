import { beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed.js';
import { prisma } from '../../src/lib/prisma.js';
import { assertTestDatabase, resetDatabase } from '../helpers/reset-database.js';

async function expectEmptyTables() {
  expect(await prisma.booking.count()).toBe(0);
  expect(await prisma.session.count()).toBe(0);
  expect(await prisma.membership.count()).toBe(0);
  expect(await prisma.machine.count()).toBe(0);
  expect(await prisma.house.count()).toBe(0);
  expect(await prisma.user.count()).toBe(0);
}

describe('assertTestDatabase', () => {
  it('allows waschplan_test', () => {
    expect(assertTestDatabase('waschplan_test')).toBeUndefined();
  });

  it('rejects waschplan_dev', () => {
    expect(() => assertTestDatabase('waschplan_dev')).toThrow(
      'Refusing to reset database "waschplan_dev"',
    );
  });

  it('rejects any other database name', () => {
    expect(() => assertTestDatabase('postgres')).toThrow('Refusing to reset database "postgres"');
  });
});

describe('resetDatabase', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('clears users, sessions, houses, memberships, machines and bookings', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'ada@example.com',
        name: 'Ada',
        passwordHash: 'hash',
      },
    });

    await prisma.session.create({
      data: {
        id: 'session-1',
        userId: user.id,
        expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      },
    });

    const house = await prisma.house.create({
      data: {
        name: 'Test House',
        slug: 'test-house',
        inviteCode: 'TEST01',
      },
    });

    await prisma.membership.create({
      data: {
        userId: user.id,
        houseId: house.id,
        role: 'RESIDENT',
      },
    });

    const machine = await prisma.machine.create({
      data: {
        houseId: house.id,
        name: 'Waschmaschine 1',
        type: 'WASHER',
      },
    });

    await prisma.booking.create({
      data: {
        machineId: machine.id,
        userId: user.id,
        startsAt: new Date('2026-11-10T07:00:00.000Z'),
        endsAt: new Date('2026-11-10T09:00:00.000Z'),
      },
    });

    await resetDatabase();

    await expectEmptyTables();
  });

  it('resolves when the database is already empty', async () => {
    await expect(resetDatabase()).resolves.toBeUndefined();
    await expectEmptyTables();
  });

  it('clears rows created by the seed', async () => {
    await seed();
    await resetDatabase();
    await expectEmptyTables();
  });
});
