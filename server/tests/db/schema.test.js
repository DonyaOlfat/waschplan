import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { resetDatabase } from '../helpers/reset-database.js';

const STARTS_AT = new Date('2026-11-10T07:00:00.000Z');
const ENDS_AT = new Date('2026-11-10T09:00:00.000Z');

async function createUser(email = 'ada@example.com') {
  return prisma.user.create({
    data: {
      email,
      name: 'Ada',
      passwordHash: 'hash',
    },
  });
}

async function createHouse({ name = 'House', slug = 'house', inviteCode = 'INVITE' } = {}) {
  return prisma.house.create({
    data: { name, slug, inviteCode },
  });
}

async function createMachine(houseId, name = 'Waschmaschine 1') {
  return prisma.machine.create({
    data: {
      houseId,
      name,
      type: 'WASHER',
    },
  });
}

async function createBooking(machineId, userId, startsAt = STARTS_AT) {
  return prisma.booking.create({
    data: {
      machineId,
      userId,
      startsAt,
      endsAt: ENDS_AT,
    },
  });
}

describe('schema constraints', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('rejects a second booking for the same machine and start time', async () => {
    const user = await createUser();
    const house = await createHouse();
    const machine = await createMachine(house.id);

    await createBooking(machine.id, user.id);

    await expect(createBooking(machine.id, user.id)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a second membership for the same user', async () => {
    const user = await createUser();
    const firstHouse = await createHouse({ slug: 'house-a', inviteCode: 'CODE01' });
    const secondHouse = await createHouse({ slug: 'house-b', inviteCode: 'CODE02' });

    await prisma.membership.create({
      data: { userId: user.id, houseId: firstHouse.id, role: 'RESIDENT' },
    });

    await expect(
      prisma.membership.create({
        data: { userId: user.id, houseId: secondHouse.id, role: 'ADMIN' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a second machine with the same name in one house', async () => {
    const house = await createHouse();

    await createMachine(house.id, 'Waschmaschine 1');

    await expect(createMachine(house.id, 'Waschmaschine 1')).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('allows the same machine name in two houses', async () => {
    const firstHouse = await createHouse({ slug: 'house-a', inviteCode: 'CODE01' });
    const secondHouse = await createHouse({ slug: 'house-b', inviteCode: 'CODE02' });

    await createMachine(firstHouse.id, 'Waschmaschine 1');

    await expect(createMachine(secondHouse.id, 'Waschmaschine 1')).resolves.toMatchObject({
      name: 'Waschmaschine 1',
      houseId: secondHouse.id,
    });
  });

  it('rejects a duplicate house slug', async () => {
    await createHouse({ slug: 'same-slug', inviteCode: 'CODE01' });

    await expect(createHouse({ slug: 'same-slug', inviteCode: 'CODE02' })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rejects a duplicate invite code', async () => {
    await createHouse({ slug: 'slug-one', inviteCode: 'CODE01' });

    await expect(createHouse({ slug: 'slug-two', inviteCode: 'CODE01' })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rejects a duplicate user email', async () => {
    await createUser('ada@example.com');

    await expect(createUser('ada@example.com')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('deletes bookings when the machine is deleted', async () => {
    const user = await createUser();
    const house = await createHouse();
    const machine = await createMachine(house.id);

    await createBooking(machine.id, user.id);
    await prisma.machine.delete({ where: { id: machine.id } });

    expect(await prisma.booking.count()).toBe(0);
  });

  it('rejects deleting a user who still has a booking', async () => {
    const user = await createUser();
    const house = await createHouse();
    const machine = await createMachine(house.id);

    await createBooking(machine.id, user.id);

    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('rejects deleting a house that still has a machine', async () => {
    const house = await createHouse();

    await createMachine(house.id);

    await expect(prisma.house.delete({ where: { id: house.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
  });
});
