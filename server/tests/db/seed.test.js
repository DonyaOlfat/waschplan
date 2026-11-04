import { beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed.js';
import { prisma } from '../../src/lib/prisma.js';
import { resetDatabase } from '../helpers/reset-database.js';

describe('seed', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns the Wuppertal demo house', async () => {
    const result = await seed();

    expect(result.house.slug).toBe('wittensteinstr-12');
    expect(result.house.inviteCode).toBe('WUPP42');
    expect(result.userCount).toBe(4);
    expect(result.machineCount).toBe(3);
  });

  it('writes one house, four users, four memberships, three machines and no bookings or sessions', async () => {
    await seed();

    expect(await prisma.house.count()).toBe(1);
    expect(await prisma.user.count()).toBe(4);
    expect(await prisma.membership.count()).toBe(4);
    expect(await prisma.machine.count()).toBe(3);
    expect(await prisma.booking.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
  });

  it('makes Lena the only admin', async () => {
    await seed();

    const memberships = await prisma.membership.findMany({
      include: { user: true },
    });
    const admins = memberships.filter((membership) => membership.role === 'ADMIN');
    const residents = memberships.filter((membership) => membership.role === 'RESIDENT');

    expect(admins).toHaveLength(1);
    expect(admins[0].user.name).toBe('Lena');
    expect(residents).toHaveLength(3);
  });

  it('creates two washers and one dryer, none broken', async () => {
    await seed();

    const machines = await prisma.machine.findMany();

    expect(machines.filter((machine) => machine.type === 'WASHER')).toHaveLength(2);
    expect(machines.filter((machine) => machine.type === 'DRYER')).toHaveLength(1);
    expect(machines.every((machine) => machine.isBroken === false)).toBe(true);
  });

  it('leaves the same counts when run again', async () => {
    await seed();

    const before = {
      houses: await prisma.house.count(),
      users: await prisma.user.count(),
      memberships: await prisma.membership.count(),
      machines: await prisma.machine.count(),
      bookings: await prisma.booking.count(),
      sessions: await prisma.session.count(),
    };

    await seed();

    expect(await prisma.house.count()).toBe(before.houses);
    expect(await prisma.user.count()).toBe(before.users);
    expect(await prisma.membership.count()).toBe(before.memberships);
    expect(await prisma.machine.count()).toBe(before.machines);
    expect(await prisma.booking.count()).toBe(before.bookings);
    expect(await prisma.session.count()).toBe(before.sessions);
  });

  it('stores a bcrypt hash for every user', async () => {
    await seed();

    const users = await prisma.user.findMany();

    expect(users).toHaveLength(4);

    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$2[ab]\$/);
      expect(user.passwordHash).not.toBe('waschplan');
    }
  });
});
