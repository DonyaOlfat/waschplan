import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { setMachineBroken } from '../../src/modules/machine/service.js';
import {
  generateWeekSlots,
  isSlotInPast,
  validateBookingWindow,
} from '../../src/modules/slots/slots.js';
import { createLoginRateLimit } from '../../src/middleware/login-rate-limit.js';
import { resetDatabase } from '../helpers/reset-database.js';

const PASSWORD = 'correct-horse';

const app = createApp({
  auth: {
    loginRateLimit: createLoginRateLimit({ limit: 1000 }),
  },
});

async function registerAndLogin(email, name) {
  const registered = await request(app).post('/api/auth/register').send({
    email,
    name,
    password: PASSWORD,
  });

  expect(registered.status).toBe(201);

  const agent = request.agent(app);
  const loggedIn = await agent.post('/api/auth/login').send({ email, password: PASSWORD });

  expect(loggedIn.status).toBe(200);

  return agent;
}

async function createNamedHouse(agent, name) {
  const response = await agent.post('/api/houses').send({ name });

  expect(response.status).toBe(201);

  return response.body;
}

function machinesPath(slug, id) {
  const path = `/api/houses/${slug}/machines`;
  return id ? `${path}/${id}` : path;
}

function bookingsPath(slug) {
  return `/api/houses/${slug}/bookings`;
}

function earliestBookableSlot(now) {
  let instant = now;

  for (let week = 0; week < 4; week += 1) {
    const slots = generateWeekSlots(instant);
    const open = slots.find(
      (slot) => validateBookingWindow(slot.startsAt, now).ok && !isSlotInPast(slot.startsAt, now),
    );

    if (open) {
      return open;
    }

    instant = new Date(slots.at(-1).endsAt.getTime() + 2 * 24 * 60 * 60 * 1000);
  }

  throw new Error('No bookable slot.');
}

function bookingAt(machineId, userId, startsAt, status) {
  return {
    machineId,
    userId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60_000),
    status,
  };
}

function statusAt(bookings, machineId, startsAt) {
  const match = bookings.find(
    (booking) =>
      booking.machineId === machineId && booking.startsAt.getTime() === startsAt.getTime(),
  );

  return match.status;
}

describe('machines', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('GET /api/houses/:slug/machines', () => {
    it('lists only the machines of that house for an admin and a resident', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const house = await createNamedHouse(ada, 'Haus');
      const other = await createNamedHouse(cy, 'Other');

      await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

      const earlier = new Date('2026-11-01T09:00:00.000Z');
      const same = new Date('2026-11-02T09:00:00.000Z');
      const earliest = new Date('2026-11-01T08:00:00.000Z');

      await prisma.machine.create({
        data: { houseId: other.id, name: 'Aaa', type: 'WASHER', createdAt: earliest },
      });
      const beta = await prisma.machine.create({
        data: { houseId: house.id, name: 'Beta', type: 'DRYER', createdAt: same },
      });
      const zebra = await prisma.machine.create({
        data: { houseId: house.id, name: 'Zebra', type: 'WASHER', createdAt: earlier },
      });
      const alpha = await prisma.machine.create({
        data: { houseId: house.id, name: 'Alpha', type: 'WASHER', createdAt: same },
      });

      const asAdmin = await ada.get(machinesPath(house.slug));
      const asResident = await bea.get(machinesPath(house.slug));
      const expected = [
        {
          id: zebra.id,
          name: 'Zebra',
          type: 'WASHER',
          isBroken: false,
          createdAt: earlier.toISOString(),
        },
        {
          id: alpha.id,
          name: 'Alpha',
          type: 'WASHER',
          isBroken: false,
          createdAt: same.toISOString(),
        },
        {
          id: beta.id,
          name: 'Beta',
          type: 'DRYER',
          isBroken: false,
          createdAt: same.toISOString(),
        },
      ];

      expect(asAdmin.status).toBe(200);
      expect(asResident.status).toBe(200);
      expect(asAdmin.body).toEqual(expected);
      expect(asResident.body).toEqual(expected);
    });

    it('returns an empty list when the house has no machines', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const response = await ada.get(machinesPath(house.slug));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('returns the same 404 for a non-member and an unknown slug', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');

      await createNamedHouse(ada, 'Haus');

      const outsider = await bea.get(machinesPath('haus'));
      const missing = await bea.get(machinesPath('missing'));
      const loggedOut = await request(app).get(machinesPath('haus'));

      expect(outsider.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(outsider.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found.' },
      });
      expect(missing.body).toEqual(outsider.body);
      expect(loggedOut.status).toBe(401);
      expect(loggedOut.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('POST /api/houses/:slug/machines', () => {
    it('creates a washer and a dryer with a trimmed name', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const washer = await ada.post(machinesPath(house.slug)).send({
        name: '  Waschmaschine 1  ',
        type: 'WASHER',
      });
      const dryer = await ada.post(machinesPath(house.slug)).send({
        name: '  Trockner  ',
        type: 'DRYER',
      });

      expect(washer.status).toBe(201);
      expect(washer.body).toMatchObject({
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: false,
      });
      expect(washer.body).not.toHaveProperty('houseId');
      expect(dryer.status).toBe(201);
      expect(dryer.body).toMatchObject({
        name: 'Trockner',
        type: 'DRYER',
        isBroken: false,
      });

      const washerRow = await prisma.machine.findUnique({ where: { id: washer.body.id } });
      const dryerRow = await prisma.machine.findUnique({ where: { id: dryer.body.id } });

      expect(washerRow).toMatchObject({
        houseId: house.id,
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: false,
      });
      expect(dryerRow).toMatchObject({
        houseId: house.id,
        name: 'Trockner',
        type: 'DRYER',
        isBroken: false,
      });
    });

    it('rejects a duplicate trimmed name and allows that name in another house', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const house = await createNamedHouse(ada, 'Haus');
      const other = await createNamedHouse(cy, 'Other');
      const created = await ada.post(machinesPath(house.slug)).send({
        name: 'Trockner',
        type: 'DRYER',
      });
      const duplicate = await ada.post(machinesPath(house.slug)).send({
        name: '  Trockner  ',
        type: 'WASHER',
      });
      const elsewhere = await cy.post(machinesPath(other.slug)).send({
        name: '  Trockner  ',
        type: 'DRYER',
      });

      expect(created.status).toBe(201);
      expect(duplicate.status).toBe(409);
      expect(duplicate.body).toEqual({
        error: {
          code: 'MACHINE_NAME_TAKEN',
          message: 'A machine with this name already exists.',
        },
      });
      expect(elsewhere.status).toBe(201);
      expect(elsewhere.body.name).toBe('Trockner');

      const inHouse = await prisma.machine.findMany({ where: { houseId: house.id } });

      expect(inHouse).toHaveLength(1);
      expect(inHouse[0]).toMatchObject({ name: 'Trockner', type: 'DRYER' });
      expect(await prisma.machine.count({ where: { houseId: other.id } })).toBe(1);
    });

    it('rejects a resident, a non-member, and a logged-out request', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const house = await createNamedHouse(ada, 'Haus');

      await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

      const body = { name: 'Waschmaschine 1', type: 'WASHER' };
      const resident = await bea.post(machinesPath(house.slug)).send(body);
      const outsider = await cy.post(machinesPath(house.slug)).send(body);
      const loggedOut = await request(app).post(machinesPath(house.slug)).send(body);

      expect(resident.status).toBe(403);
      expect(resident.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'You are not allowed to do that.' },
      });
      expect(outsider.status).toBe(404);
      expect(outsider.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found.' },
      });
      expect(loggedOut.status).toBe(401);
      expect(loggedOut.body.error.code).toBe('UNAUTHENTICATED');
      expect(await prisma.machine.count()).toBe(0);
    });

    it('rejects an unknown type, a blank name, and isBroken from an admin', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const oven = await ada.post(machinesPath(house.slug)).send({
        name: 'Ofen',
        type: 'OVEN',
      });
      const blank = await ada.post(machinesPath(house.slug)).send({
        name: '   ',
        type: 'WASHER',
      });
      const broken = await ada.post(machinesPath(house.slug)).send({
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: true,
      });

      expect(oven.status).toBe(400);
      expect(oven.body.error.code).toBe('VALIDATION_ERROR');
      expect(blank.status).toBe(400);
      expect(blank.body.error.code).toBe('VALIDATION_ERROR');
      expect(broken.status).toBe(400);
      expect(broken.body.error.code).toBe('VALIDATION_ERROR');
      expect(await prisma.machine.count()).toBe(0);
    });
  });

  describe('PATCH /api/houses/:slug/machines/:id', () => {
    it('renames a machine without changing type or isBroken', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const machine = await prisma.machine.create({
        data: {
          houseId: house.id,
          name: 'Trockner',
          type: 'DRYER',
          isBroken: true,
        },
      });
      const response = await ada.patch(machinesPath(house.slug, machine.id)).send({
        name: '  Trockner links  ',
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: machine.id,
        name: 'Trockner links',
        type: 'DRYER',
        isBroken: true,
      });
      expect(response.body).not.toHaveProperty('houseId');

      const row = await prisma.machine.findUnique({ where: { id: machine.id } });

      expect(row).toMatchObject({
        name: 'Trockner links',
        type: 'DRYER',
        isBroken: true,
      });
    });

    it('rejects a name taken in the house and accepts the current name', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const left = await prisma.machine.create({
        data: { houseId: house.id, name: 'Links', type: 'WASHER' },
      });

      await prisma.machine.create({
        data: { houseId: house.id, name: 'Rechts', type: 'DRYER' },
      });

      const conflict = await ada.patch(machinesPath(house.slug, left.id)).send({
        name: '  Rechts  ',
      });
      const stored = await prisma.machine.findUnique({ where: { id: left.id } });
      const same = await ada.patch(machinesPath(house.slug, left.id)).send({
        name: '  Links  ',
      });

      expect(conflict.status).toBe(409);
      expect(conflict.body).toEqual({
        error: {
          code: 'MACHINE_NAME_TAKEN',
          message: 'A machine with this name already exists.',
        },
      });
      expect(stored.name).toBe('Links');
      expect(same.status).toBe(200);
      expect(same.body).toMatchObject({ id: left.id, name: 'Links' });
    });

    it('rejects a resident, a non-member, an unknown id, and another house', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const house = await createNamedHouse(ada, 'Haus');
      const other = await createNamedHouse(cy, 'Other');

      await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Links', type: 'WASHER' },
      });
      const foreign = await prisma.machine.create({
        data: { houseId: other.id, name: 'Fremd', type: 'DRYER' },
      });
      const resident = await bea.patch(machinesPath(house.slug, machine.id)).send({ name: 'Neu' });
      const outsider = await cy.patch(machinesPath(house.slug, machine.id)).send({ name: 'Neu' });
      const missing = await ada.patch(machinesPath(house.slug, 'missing-machine')).send({
        name: 'Neu',
      });
      const wrongHouse = await ada.patch(machinesPath(house.slug, foreign.id)).send({
        name: 'Neu',
      });

      expect(resident.status).toBe(403);
      expect(resident.body.error.code).toBe('FORBIDDEN');
      expect(outsider.status).toBe(404);
      expect(outsider.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found.' },
      });
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual(outsider.body);
      expect(wrongHouse.status).toBe(404);
      expect(wrongHouse.body).toEqual(outsider.body);
      expect((await prisma.machine.findUnique({ where: { id: machine.id } })).name).toBe('Links');
      expect((await prisma.machine.findUnique({ where: { id: foreign.id } })).name).toBe('Fremd');
    });

    it('rejects isBroken and type from an admin', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Links', type: 'WASHER' },
      });
      const broken = await ada.patch(machinesPath(house.slug, machine.id)).send({
        name: 'Neu',
        isBroken: true,
      });
      const typed = await ada.patch(machinesPath(house.slug, machine.id)).send({
        name: 'Neu',
        type: 'DRYER',
      });

      expect(broken.status).toBe(400);
      expect(broken.body.error.code).toBe('VALIDATION_ERROR');
      expect(typed.status).toBe(400);
      expect(typed.body.error.code).toBe('VALIDATION_ERROR');
      expect((await prisma.machine.findUnique({ where: { id: machine.id } })).name).toBe('Links');
    });

    it('lets an admin mark a machine as broken without changing name or type', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const createdAt = new Date('2026-11-01T09:00:00.000Z');
      const machine = await prisma.machine.create({
        data: {
          houseId: house.id,
          name: 'Waschmaschine 1',
          type: 'WASHER',
          createdAt,
        },
      });
      const response = await ada.patch(machinesPath(house.slug, machine.id)).send({
        isBroken: true,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: machine.id,
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: true,
        createdAt: createdAt.toISOString(),
      });

      const row = await prisma.machine.findUnique({ where: { id: machine.id } });

      expect(row).toMatchObject({
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: true,
      });
    });

    it('lets an admin clear the broken flag without changing the name', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const machine = await prisma.machine.create({
        data: {
          houseId: house.id,
          name: 'Waschmaschine 1',
          type: 'WASHER',
          isBroken: true,
        },
      });
      const response = await ada.patch(machinesPath(house.slug, machine.id)).send({
        isBroken: false,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: machine.id,
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: false,
      });
      expect(response.body).not.toHaveProperty('houseId');

      const row = await prisma.machine.findUnique({ where: { id: machine.id } });

      expect(row).toMatchObject({
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: false,
      });
    });

    it('rejects a broken toggle from a resident, a non-member, an unknown id, another house, and a logged-out caller', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const house = await createNamedHouse(ada, 'Haus');
      const other = await createNamedHouse(cy, 'Other');

      await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const foreign = await prisma.machine.create({
        data: { houseId: other.id, name: 'Fremd', type: 'DRYER' },
      });
      const resident = await bea.patch(machinesPath(house.slug, machine.id)).send({
        isBroken: true,
      });
      const outsider = await cy.patch(machinesPath(house.slug, machine.id)).send({
        isBroken: true,
      });
      const missing = await ada.patch(machinesPath(house.slug, 'missing-machine')).send({
        isBroken: true,
      });
      const wrongHouse = await ada.patch(machinesPath(house.slug, foreign.id)).send({
        isBroken: true,
      });
      const loggedOut = await request(app).patch(machinesPath(house.slug, machine.id)).send({
        isBroken: true,
      });

      expect(resident.status).toBe(403);
      expect(resident.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'You are not allowed to do that.' },
      });
      expect(outsider.status).toBe(404);
      expect(outsider.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found.' },
      });
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual(outsider.body);
      expect(wrongHouse.status).toBe(404);
      expect(wrongHouse.body).toEqual(outsider.body);
      expect(loggedOut.status).toBe(401);
      expect(loggedOut.body.error.code).toBe('UNAUTHENTICATED');
      expect((await prisma.machine.findUnique({ where: { id: machine.id } })).isBroken).toBe(false);
      expect((await prisma.machine.findUnique({ where: { id: foreign.id } })).isBroken).toBe(false);
    });

    it('rejects a non-boolean isBroken, an empty body, and extra keys', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const text = await ada.patch(machinesPath(house.slug, machine.id)).send({
        isBroken: 'yes',
      });
      const empty = await ada.patch(machinesPath(house.slug, machine.id)).send({});
      const extra = await ada.patch(machinesPath(house.slug, machine.id)).send({
        isBroken: true,
        type: 'DRYER',
      });

      expect(text.status).toBe(400);
      expect(text.body.error.code).toBe('VALIDATION_ERROR');
      expect(empty.status).toBe(400);
      expect(empty.body.error.code).toBe('VALIDATION_ERROR');
      expect(extra.status).toBe(400);
      expect(extra.body.error.code).toBe('VALIDATION_ERROR');
      expect((await prisma.machine.findUnique({ where: { id: machine.id } })).isBroken).toBe(false);
    });

    it('breaks a machine, rejects a booking, and restores future bookings on repair', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const adaUser = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const pastStart = new Date('2020-06-15T10:00:00.000Z');
      const futureStart = new Date('2099-06-15T10:00:00.000Z');
      const slot = earliestBookableSlot(new Date());

      await prisma.booking.createMany({
        data: [
          bookingAt(machine.id, adaUser.id, pastStart, 'ACTIVE'),
          bookingAt(machine.id, adaUser.id, futureStart, 'ACTIVE'),
        ],
      });

      const broken = await ada.patch(machinesPath(house.slug, machine.id)).send({
        isBroken: true,
      });
      const afterBreak = await prisma.booking.findMany({ where: { machineId: machine.id } });
      const rejected = await ada.post(bookingsPath(house.slug)).send({
        machineId: machine.id,
        startsAt: slot.startsAt.toISOString(),
      });

      expect(broken.status).toBe(200);
      expect(broken.body).toMatchObject({ id: machine.id, isBroken: true });
      expect(afterBreak).toHaveLength(2);
      expect(statusAt(afterBreak, machine.id, futureStart)).toBe('AFFECTED');
      expect(statusAt(afterBreak, machine.id, pastStart)).toBe('ACTIVE');
      expect(rejected.status).toBe(409);
      expect(rejected.body).toEqual({
        error: { code: 'MACHINE_BROKEN', message: 'This machine is broken.' },
      });
      expect(await prisma.booking.count({ where: { machineId: machine.id } })).toBe(2);

      const repaired = await ada.patch(machinesPath(house.slug, machine.id)).send({
        isBroken: false,
      });
      const afterRepair = await prisma.booking.findMany({ where: { machineId: machine.id } });

      expect(repaired.status).toBe(200);
      expect(repaired.body).toMatchObject({ id: machine.id, isBroken: false });
      expect(statusAt(afterRepair, machine.id, futureStart)).toBe('ACTIVE');
      expect(statusAt(afterRepair, machine.id, pastStart)).toBe('ACTIVE');

      const created = await ada.post(bookingsPath(house.slug)).send({
        machineId: machine.id,
        startsAt: slot.startsAt.toISOString(),
      });
      const afterCreate = await prisma.booking.findMany({ where: { machineId: machine.id } });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        machineId: machine.id,
        startsAt: slot.startsAt.toISOString(),
        status: 'ACTIVE',
      });
      expect(afterCreate).toHaveLength(3);
      expect(statusAt(afterCreate, machine.id, futureStart)).toBe('ACTIVE');
      expect(statusAt(afterCreate, machine.id, pastStart)).toBe('ACTIVE');
    });
  });

  describe('setMachineBroken', () => {
    it('marks future active bookings on that machine as affected', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const house = await createNamedHouse(ada, 'Haus');

      await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

      const adaUser = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const beaUser = await prisma.user.findUnique({ where: { email: 'bea@example.com' } });
      const now = new Date('2026-06-15T10:00:00.000Z');
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const other = await prisma.machine.create({
        data: { houseId: house.id, name: 'Trockner', type: 'DRYER' },
      });
      const justAfter = new Date(now.getTime() + 1);
      const otherUserAfter = new Date(now.getTime() + 2);
      const atNow = new Date(now.getTime());
      const justBefore = new Date(now.getTime() - 1);
      const futureAffected = new Date(now.getTime() + 60 * 60 * 1000);
      const pastAffected = new Date(now.getTime() - 60 * 60 * 1000);
      const otherFuture = new Date(now.getTime() + 3);

      await prisma.booking.createMany({
        data: [
          bookingAt(machine.id, adaUser.id, justAfter, 'ACTIVE'),
          bookingAt(machine.id, beaUser.id, otherUserAfter, 'ACTIVE'),
          bookingAt(machine.id, adaUser.id, atNow, 'ACTIVE'),
          bookingAt(machine.id, beaUser.id, justBefore, 'ACTIVE'),
          bookingAt(machine.id, adaUser.id, futureAffected, 'AFFECTED'),
          bookingAt(machine.id, beaUser.id, pastAffected, 'AFFECTED'),
          bookingAt(other.id, adaUser.id, otherFuture, 'ACTIVE'),
        ],
      });

      const broken = await setMachineBroken({
        houseId: house.id,
        machineId: machine.id,
        isBroken: true,
        now,
      });
      const afterBreak = await prisma.booking.findMany();

      expect(broken).toMatchObject({
        id: machine.id,
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: true,
      });
      expect(afterBreak).toHaveLength(7);
      expect(statusAt(afterBreak, machine.id, justAfter)).toBe('AFFECTED');
      expect(statusAt(afterBreak, machine.id, otherUserAfter)).toBe('AFFECTED');
      expect(statusAt(afterBreak, machine.id, atNow)).toBe('ACTIVE');
      expect(statusAt(afterBreak, machine.id, justBefore)).toBe('ACTIVE');
      expect(statusAt(afterBreak, machine.id, futureAffected)).toBe('AFFECTED');
      expect(statusAt(afterBreak, machine.id, pastAffected)).toBe('AFFECTED');
      expect(statusAt(afterBreak, other.id, otherFuture)).toBe('ACTIVE');
      expect(await prisma.machine.findUnique({ where: { id: other.id } })).toMatchObject({
        isBroken: false,
      });

      const again = await setMachineBroken({
        houseId: house.id,
        machineId: machine.id,
        isBroken: true,
        now,
      });
      const afterAgain = await prisma.booking.findMany();

      expect(again).toEqual({
        id: machine.id,
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: true,
        createdAt: machine.createdAt,
      });
      expect(statusAt(afterAgain, machine.id, justAfter)).toBe('AFFECTED');
      expect(statusAt(afterAgain, machine.id, otherUserAfter)).toBe('AFFECTED');
      expect(statusAt(afterAgain, machine.id, atNow)).toBe('ACTIVE');
      expect(statusAt(afterAgain, machine.id, justBefore)).toBe('ACTIVE');
      expect(statusAt(afterAgain, machine.id, futureAffected)).toBe('AFFECTED');
      expect(statusAt(afterAgain, machine.id, pastAffected)).toBe('AFFECTED');
      expect(statusAt(afterAgain, other.id, otherFuture)).toBe('ACTIVE');
    });

    it('restores future affected bookings when the machine is repaired', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const house = await createNamedHouse(ada, 'Haus');

      await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

      const adaUser = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const beaUser = await prisma.user.findUnique({ where: { email: 'bea@example.com' } });
      const now = new Date('2026-06-15T10:00:00.000Z');
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER', isBroken: true },
      });
      const other = await prisma.machine.create({
        data: { houseId: house.id, name: 'Trockner', type: 'DRYER' },
      });
      const justAfter = new Date(now.getTime() + 1);
      const otherUserAfter = new Date(now.getTime() + 2);
      const atNow = new Date(now.getTime());
      const justBefore = new Date(now.getTime() - 1);
      const futureActive = new Date(now.getTime() + 60 * 60 * 1000);
      const otherActiveOne = new Date(now.getTime() + 4);
      const otherActiveTwo = new Date(now.getTime() + 5);
      const otherAffected = new Date(now.getTime() + 6);

      await prisma.booking.createMany({
        data: [
          bookingAt(machine.id, adaUser.id, justAfter, 'AFFECTED'),
          bookingAt(machine.id, beaUser.id, otherUserAfter, 'AFFECTED'),
          bookingAt(machine.id, adaUser.id, atNow, 'AFFECTED'),
          bookingAt(machine.id, adaUser.id, justBefore, 'AFFECTED'),
          bookingAt(machine.id, beaUser.id, futureActive, 'ACTIVE'),
          bookingAt(other.id, adaUser.id, otherActiveOne, 'ACTIVE'),
          bookingAt(other.id, adaUser.id, otherActiveTwo, 'ACTIVE'),
          bookingAt(other.id, adaUser.id, otherAffected, 'AFFECTED'),
        ],
      });

      const repaired = await setMachineBroken({
        houseId: house.id,
        machineId: machine.id,
        isBroken: false,
        now,
      });
      const afterRepair = await prisma.booking.findMany();
      const upcomingActive = await prisma.booking.count({
        where: {
          userId: adaUser.id,
          status: 'ACTIVE',
          startsAt: { gt: now },
          machine: { houseId: house.id },
        },
      });

      expect(repaired).toEqual({
        id: machine.id,
        name: 'Waschmaschine 1',
        type: 'WASHER',
        isBroken: false,
        createdAt: machine.createdAt,
      });
      expect(afterRepair).toHaveLength(8);
      expect(statusAt(afterRepair, machine.id, justAfter)).toBe('ACTIVE');
      expect(statusAt(afterRepair, machine.id, otherUserAfter)).toBe('ACTIVE');
      expect(statusAt(afterRepair, machine.id, atNow)).toBe('AFFECTED');
      expect(statusAt(afterRepair, machine.id, justBefore)).toBe('AFFECTED');
      expect(statusAt(afterRepair, machine.id, futureActive)).toBe('ACTIVE');
      expect(statusAt(afterRepair, other.id, otherActiveOne)).toBe('ACTIVE');
      expect(statusAt(afterRepair, other.id, otherActiveTwo)).toBe('ACTIVE');
      expect(statusAt(afterRepair, other.id, otherAffected)).toBe('AFFECTED');
      expect(upcomingActive).toBe(3);
      expect(await prisma.machine.findUnique({ where: { id: other.id } })).toMatchObject({
        isBroken: false,
      });
    });
  });

  describe('DELETE /api/houses/:slug/machines/:id', () => {
    it('deletes the machine and its bookings and keeps another machine', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const user = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const doomed = await prisma.machine.create({
        data: { houseId: house.id, name: 'Alt', type: 'WASHER' },
      });
      const kept = await prisma.machine.create({
        data: { houseId: house.id, name: 'Bleibt', type: 'DRYER' },
      });
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 60 * 60 * 1000);
      const keptStart = new Date(Date.now() + 2 * 60 * 60 * 1000);

      await prisma.booking.createMany({
        data: [
          {
            machineId: doomed.id,
            userId: user.id,
            startsAt: past,
            endsAt: new Date(past.getTime() + 60_000),
            status: 'ACTIVE',
          },
          {
            machineId: doomed.id,
            userId: user.id,
            startsAt: future,
            endsAt: new Date(future.getTime() + 60_000),
            status: 'AFFECTED',
          },
          {
            machineId: kept.id,
            userId: user.id,
            startsAt: keptStart,
            endsAt: new Date(keptStart.getTime() + 60_000),
            status: 'ACTIVE',
          },
        ],
      });

      const response = await ada.delete(machinesPath(house.slug, doomed.id));

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(await prisma.machine.findUnique({ where: { id: doomed.id } })).toBeNull();
      expect(await prisma.booking.count({ where: { machineId: doomed.id } })).toBe(0);

      const remainingMachine = await prisma.machine.findUnique({ where: { id: kept.id } });
      const remainingBookings = await prisma.booking.findMany({ where: { machineId: kept.id } });

      expect(remainingMachine).toMatchObject({ name: 'Bleibt' });
      expect(remainingBookings).toHaveLength(1);
      expect(remainingBookings[0].status).toBe('ACTIVE');
    });

    it('rejects a resident, a non-member, an unknown id, another house, and a logged-out user', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const house = await createNamedHouse(ada, 'Haus');
      const other = await createNamedHouse(cy, 'Other');

      await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

      const user = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Alt', type: 'WASHER' },
      });
      const foreign = await prisma.machine.create({
        data: { houseId: other.id, name: 'Fremd', type: 'DRYER' },
      });
      const startsAt = new Date(Date.now() + 60 * 60 * 1000);
      const booking = await prisma.booking.create({
        data: {
          machineId: machine.id,
          userId: user.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60_000),
          status: 'ACTIVE',
        },
      });
      const resident = await bea.delete(machinesPath(house.slug, machine.id));
      const outsider = await cy.delete(machinesPath(house.slug, machine.id));
      const missing = await ada.delete(machinesPath(house.slug, 'missing-machine'));
      const wrongHouse = await ada.delete(machinesPath(house.slug, foreign.id));
      const loggedOut = await request(app).delete(machinesPath(house.slug, machine.id));

      expect(resident.status).toBe(403);
      expect(resident.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'You are not allowed to do that.' },
      });
      expect(outsider.status).toBe(404);
      expect(outsider.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found.' },
      });
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual(outsider.body);
      expect(wrongHouse.status).toBe(404);
      expect(wrongHouse.body).toEqual(outsider.body);
      expect(loggedOut.status).toBe(401);
      expect(loggedOut.body.error.code).toBe('UNAUTHENTICATED');
      expect(await prisma.machine.findUnique({ where: { id: machine.id } })).toMatchObject({
        name: 'Alt',
      });
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
        machineId: machine.id,
        status: 'ACTIVE',
      });
      expect(await prisma.machine.findUnique({ where: { id: foreign.id } })).toMatchObject({
        name: 'Fremd',
      });
    });
  });
});
