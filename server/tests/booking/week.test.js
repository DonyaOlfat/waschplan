import { DateTime } from 'luxon';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { createLoginRateLimit } from '../../src/middleware/login-rate-limit.js';
import {
  cancelBooking,
  getMachineWeek,
  listMyBookings,
} from '../../src/modules/booking/service.js';
import {
  generateWeekSlots,
  isSlotInPast,
  validateBookingWindow,
} from '../../src/modules/slots/slots.js';
import { BERLIN_ZONE, parseBerlinDate } from '../../src/modules/slots/time.js';
import { resetDatabase } from '../helpers/reset-database.js';

const PASSWORD = 'correct-horse';
const NOW = new Date('2026-04-01T13:00:00.000Z');
const MONDAY_0600 = '2026-03-30T04:00:00.000Z';
const WEDNESDAY_1200 = '2026-04-01T10:00:00.000Z';
const WEDNESDAY_1400 = '2026-04-01T12:00:00.000Z';
const WEDNESDAY_1600 = '2026-04-01T14:00:00.000Z';
const WEDNESDAY_1800 = '2026-04-01T16:00:00.000Z';
const THURSDAY_0600 = '2026-04-02T04:00:00.000Z';
const THURSDAY_0800 = '2026-04-02T06:00:00.000Z';
const THURSDAY_1000 = '2026-04-02T08:00:00.000Z';
const THURSDAY_1200 = '2026-04-02T10:00:00.000Z';
const APRIL_WEEK = generateWeekSlots(parseBerlinDate('2026-04-01'));

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Not found.' } };
const UNAUTHENTICATED = { error: { code: 'UNAUTHENTICATED', message: 'You need to log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You are not allowed to do that.' } };
const SLOT_IN_PAST = {
  error: { code: 'SLOT_IN_PAST', message: 'This slot has already started.' },
};

const app = createApp({
  auth: {
    loginRateLimit: createLoginRateLimit({ limit: 1000 }),
  },
});

function weekPath(slug, machineId) {
  return `/api/houses/${slug}/machines/${machineId}/week`;
}

function mePath(slug) {
  return `/api/houses/${slug}/bookings/me`;
}

function bookingsPath(slug) {
  return `/api/houses/${slug}/bookings`;
}

function bookingPath(slug, id) {
  return `/api/houses/${slug}/bookings/${id}`;
}

function opening(startsAt) {
  const slot = APRIL_WEEK.find((candidate) => candidate.startsAt.toISOString() === startsAt);

  if (!slot) {
    throw new Error(`No slot starts at ${startsAt}`);
  }

  return slot;
}

function view(week, startsAt) {
  const slot = week.slots.find((candidate) => candidate.startsAt.toISOString() === startsAt);

  expect(slot).toBeDefined();

  return slot;
}

function expectEmpty(week, startsAt, status) {
  const slot = opening(startsAt);

  expect(view(week, startsAt)).toEqual({
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status,
  });
}

function expectOccupied(week, startsAt, status, bookedBy, mine) {
  const slot = opening(startsAt);

  expect(view(week, startsAt)).toEqual({
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status,
    bookedBy,
    mine,
  });
}

function berlinDate(date) {
  return DateTime.fromJSDate(date, { zone: BERLIN_ZONE }).toISODate();
}

function slotsAround(now) {
  const past = generateWeekSlots(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)).filter(
    (slot) => isSlotInPast(slot.startsAt, now),
  );
  const future = [];
  let instant = now;

  for (let week = 0; week < 4 && future.length < 4; week += 1) {
    const slots = generateWeekSlots(instant);

    for (const slot of slots) {
      if (validateBookingWindow(slot.startsAt, now).ok && !isSlotInPast(slot.startsAt, now)) {
        future.push(slot);
      }
    }

    instant = new Date(slots.at(-1).endsAt.getTime() + 2 * 24 * 60 * 60 * 1000);
  }

  if (past.length < 2 || future.length < 4) {
    throw new Error('Not enough slots around now.');
  }

  return { past, future };
}

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

async function createMachine(agent, slug, name, type) {
  const response = await agent.post(`/api/houses/${slug}/machines`).send({ name, type });

  expect(response.status).toBe(201);

  return response.body;
}

async function setup({ joinResident = true, withSam = false } = {}) {
  const ada = await registerAndLogin('ada@example.com', withSam ? 'Sam Lovelace' : 'Ada');
  const bea = await registerAndLogin('bea@example.com', 'Bea');
  const house = await createNamedHouse(ada, 'Haus');

  if (joinResident) {
    const joined = await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

    expect(joined.status).toBe(201);
  }

  let samAgent = null;

  if (withSam) {
    samAgent = await registerAndLogin('sam@example.com', 'Sam Rivera');
    const joined = await samAgent.post('/api/houses/join').send({ inviteCode: house.inviteCode });

    expect(joined.status).toBe(201);
  }

  const admin = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
  const resident = await prisma.user.findUnique({ where: { email: 'bea@example.com' } });
  const sam = withSam
    ? await prisma.user.findUnique({ where: { email: 'sam@example.com' } })
    : null;
  const washer = await createMachine(ada, house.slug, 'Washer', 'WASHER');
  const dryer = await createMachine(ada, house.slug, 'Dryer', 'DRYER');

  return { ada, bea, samAgent, house, admin, resident, sam, washer, dryer };
}

async function insertBooking({ userId, machineId, startsAt, status }) {
  const slot = opening(startsAt);

  return prisma.booking.create({
    data: {
      userId,
      machineId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status,
    },
  });
}

async function insertSlot({ userId, machineId, slot, status = 'ACTIVE' }) {
  return prisma.booking.create({
    data: {
      userId,
      machineId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status,
    },
  });
}

describe('week grid, my bookings and cancel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('getMachineWeek', () => {
    it('marks every slot status in the week of 30 March 2026', async () => {
      const { house, admin, resident, sam, washer, dryer } = await setup({ withSam: true });

      await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1200,
        status: 'AFFECTED',
      });
      await insertBooking({
        userId: resident.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1400,
        status: 'ACTIVE',
      });
      await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1600,
        status: 'ACTIVE',
      });
      await insertBooking({
        userId: resident.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1800,
        status: 'ACTIVE',
      });
      await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: THURSDAY_0600,
        status: 'AFFECTED',
      });
      await insertBooking({
        userId: sam.id,
        machineId: washer.id,
        startsAt: THURSDAY_0800,
        status: 'AFFECTED',
      });
      await insertBooking({
        userId: admin.id,
        machineId: dryer.id,
        startsAt: WEDNESDAY_1600,
        status: 'ACTIVE',
      });
      await insertBooking({
        userId: resident.id,
        machineId: dryer.id,
        startsAt: WEDNESDAY_1800,
        status: 'ACTIVE',
      });
      await prisma.machine.update({ where: { id: dryer.id }, data: { isBroken: true } });

      const week = await getMachineWeek({
        houseId: house.id,
        machineId: washer.id,
        start: '2026-04-01',
        userId: admin.id,
        now: NOW,
      });
      const broken = await getMachineWeek({
        houseId: house.id,
        machineId: dryer.id,
        start: '2026-04-01',
        userId: admin.id,
        now: NOW,
      });

      expect(week.machineId).toBe(washer.id);
      expect(week.weekStart).toBe('2026-03-30');
      expect(week.slots).toHaveLength(48);
      expect(week.slots.map((slot) => slot.startsAt.toISOString())).toEqual(
        APRIL_WEEK.map((slot) => slot.startsAt.toISOString()),
      );

      for (const slot of week.slots) {
        expect(DateTime.fromJSDate(slot.startsAt, { zone: BERLIN_ZONE }).weekday).not.toBe(7);
        expect(slot).not.toHaveProperty('userId');
        expect(slot).not.toHaveProperty('user');
        expect(slot).not.toHaveProperty('email');
        expect(slot).not.toHaveProperty('bookingId');
      }

      expectEmpty(week, MONDAY_0600, 'past');
      expectOccupied(week, WEDNESDAY_1200, 'past', 'Sam', true);
      expectOccupied(week, WEDNESDAY_1400, 'past', 'Bea', false);
      expectOccupied(week, WEDNESDAY_1600, 'mine', 'Sam', true);
      expectOccupied(week, WEDNESDAY_1800, 'booked', 'Bea', false);
      expectOccupied(week, THURSDAY_0600, 'affected', 'Sam', true);
      expectOccupied(week, THURSDAY_0800, 'affected', 'Sam', false);
      expectEmpty(week, THURSDAY_1200, 'free');

      expectEmpty(broken, MONDAY_0600, 'past');
      expectOccupied(broken, WEDNESDAY_1600, 'mine', 'Sam', true);
      expectOccupied(broken, WEDNESDAY_1800, 'booked', 'Bea', false);
      expectEmpty(broken, THURSDAY_1000, 'broken');
    });

    it('returns 48 slots for a past week and a week past the booking window', async () => {
      const { house, admin, washer } = await setup();
      const input = {
        houseId: house.id,
        machineId: washer.id,
        userId: admin.id,
        now: NOW,
      };
      const pastWeek = await getMachineWeek({ ...input, start: '2026-03-16' });
      const laterWeek = await getMachineWeek({ ...input, start: '2026-06-01' });

      expect(pastWeek.weekStart).toBe('2026-03-16');
      expect(pastWeek.slots).toHaveLength(48);
      expect(laterWeek.weekStart).toBe('2026-06-01');
      expect(laterWeek.slots).toHaveLength(48);
    });

    it('treats a Sunday start as the Monday of that week', async () => {
      const { house, admin, washer } = await setup();
      const input = {
        houseId: house.id,
        machineId: washer.id,
        userId: admin.id,
        now: NOW,
      };
      const fromSunday = await getMachineWeek({ ...input, start: '2026-04-05' });
      const fromMonday = await getMachineWeek({ ...input, start: '2026-03-30' });
      const springSunday = await getMachineWeek({ ...input, start: '2026-03-29' });
      const springMonday = await getMachineWeek({ ...input, start: '2026-03-23' });

      expect(fromSunday.weekStart).toBe('2026-03-30');
      expect(fromSunday.weekStart).toBe(fromMonday.weekStart);
      expect(fromSunday.slots.map((slot) => slot.startsAt.toISOString())).toEqual(
        fromMonday.slots.map((slot) => slot.startsAt.toISOString()),
      );
      expect(springSunday.weekStart).toBe('2026-03-23');
      expect(springSunday.slots.map((slot) => slot.startsAt.toISOString())).toEqual(
        springMonday.slots.map((slot) => slot.startsAt.toISOString()),
      );
      expect(springSunday.slots[0].startsAt.toISOString()).toBe('2026-03-23T05:00:00.000Z');
    });
  });

  describe('GET /api/houses/:slug/machines/:id/week', () => {
    it('returns 401 without a session and 400 for a bad query or slug', async () => {
      const { ada, bea, house, washer } = await setup({ joinResident: false });
      const loggedOut = await request(app)
        .get(weekPath(house.slug, washer.id))
        .query({ start: '2026-04-01' });
      const queries = [
        {},
        { start: '2026-04-01T00:00:00.000Z' },
        { start: '2026-4-1' },
        { start: '2026-02-31' },
        { start: '2026-04-01', extra: '1' },
      ];
      const rejected = [];

      for (const query of queries) {
        rejected.push(await ada.get(weekPath(house.slug, washer.id)).query(query));
      }

      const badSlug = await ada.get(weekPath('NOPE', washer.id)).query({ start: '2026-04-01' });
      const outsider = await bea
        .get(weekPath(house.slug, washer.id))
        .query({ start: '2026-02-31' });

      expect(loggedOut.status).toBe(401);
      expect(loggedOut.body).toEqual(UNAUTHENTICATED);

      for (const response of rejected) {
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }

      expect(badSlug.status).toBe(400);
      expect(badSlug.body.error.code).toBe('VALIDATION_ERROR');
      expect(outsider.status).toBe(404);
      expect(outsider.body).toEqual(NOT_FOUND);
    });

    it('returns the same 404 for outsiders and 48 slots for a Sunday', async () => {
      const { ada, bea, house, washer } = await setup({ joinResident: false });
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const other = await createNamedHouse(cy, 'Other');
      const foreign = await createMachine(cy, other.slug, 'Other washer', 'WASHER');
      const outsider = await bea
        .get(weekPath(house.slug, washer.id))
        .query({ start: '2026-04-01' });
      const missingSlug = await ada
        .get(weekPath('missing', washer.id))
        .query({ start: '2026-04-01' });
      const unknown = await ada
        .get(weekPath(house.slug, 'missing-machine'))
        .query({ start: '2026-04-01' });
      const fromOtherHouse = await ada
        .get(weekPath(house.slug, foreign.id))
        .query({ start: '2026-04-01' });
      const sunday = await ada.get(weekPath(house.slug, washer.id)).query({ start: '2026-03-29' });

      expect(outsider.status).toBe(404);
      expect(missingSlug.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(fromOtherHouse.status).toBe(404);
      expect(outsider.body).toEqual(NOT_FOUND);
      expect(missingSlug.body).toEqual(outsider.body);
      expect(unknown.body).toEqual(outsider.body);
      expect(fromOtherHouse.body).toEqual(outsider.body);

      expect(sunday.status).toBe(200);
      expect(sunday.body.machineId).toBe(washer.id);
      expect(sunday.body.weekStart).toBe('2026-03-23');
      expect(sunday.body.slots).toHaveLength(48);

      for (const slot of sunday.body.slots) {
        expect(DateTime.fromISO(slot.startsAt, { zone: BERLIN_ZONE }).weekday).not.toBe(7);
        expect(slot).not.toHaveProperty('userId');
        expect(slot).not.toHaveProperty('bookingId');
      }
    });
  });

  describe('listMyBookings', () => {
    it('returns the caller upcoming bookings in start order', async () => {
      const { house, admin, resident, washer, dryer } = await setup();
      const active = await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1600,
        status: 'ACTIVE',
      });
      const affected = await insertBooking({
        userId: admin.id,
        machineId: dryer.id,
        startsAt: WEDNESDAY_1600,
        status: 'AFFECTED',
      });
      const later = await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: THURSDAY_0600,
        status: 'ACTIVE',
      });

      await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: MONDAY_0600,
        status: 'ACTIVE',
      });
      await insertBooking({
        userId: resident.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1800,
        status: 'ACTIVE',
      });
      await prisma.booking.create({
        data: {
          userId: admin.id,
          machineId: dryer.id,
          startsAt: NOW,
          endsAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });

      const listed = await listMyBookings({ userId: admin.id, houseId: house.id, now: NOW });
      const tied = [active, affected].sort((left, right) => (left.id < right.id ? -1 : 1));

      expect(listed.map((booking) => booking.id)).toEqual([tied[0].id, tied[1].id, later.id]);
      expect(listed.map((booking) => booking.startsAt.toISOString())).toEqual([
        WEDNESDAY_1600,
        WEDNESDAY_1600,
        THURSDAY_0600,
      ]);
      expect(listed.map((booking) => booking.status).sort()).toEqual([
        'ACTIVE',
        'ACTIVE',
        'AFFECTED',
      ]);

      const washerBooking = listed.find((booking) => booking.id === active.id);

      expect(washerBooking).toMatchObject({
        machineId: washer.id,
        machine: { id: washer.id, name: 'Washer', type: 'WASHER' },
        endsAt: active.endsAt,
        createdAt: active.createdAt,
        status: 'ACTIVE',
      });
      expect(washerBooking).not.toHaveProperty('userId');
      expect(listed.find((booking) => booking.id === affected.id).machine).toEqual({
        id: dryer.id,
        name: 'Dryer',
        type: 'DRYER',
      });
    });
  });

  describe('GET /api/houses/:slug/bookings/me', () => {
    it('returns an empty list, 401, and the same 404', async () => {
      const { ada, bea, house } = await setup({ joinResident: false });
      const empty = await ada.get(mePath(house.slug));
      const loggedOut = await request(app).get(mePath(house.slug));
      const outsider = await bea.get(mePath(house.slug));
      const missing = await ada.get(mePath('missing'));

      expect(empty.status).toBe(200);
      expect(empty.body).toEqual([]);
      expect(loggedOut.status).toBe(401);
      expect(loggedOut.body).toEqual(UNAUTHENTICATED);
      expect(outsider.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(outsider.body).toEqual(NOT_FOUND);
      expect(missing.body).toEqual(outsider.body);
    });
  });

  describe('cancelBooking', () => {
    it('deletes an upcoming booking and rejects a past one', async () => {
      const { house, admin, resident, washer } = await setup();
      const upcoming = await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1600,
        status: 'ACTIVE',
      });
      const affected = await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: THURSDAY_0600,
        status: 'AFFECTED',
      });
      const otherUpcoming = await insertBooking({
        userId: resident.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1800,
        status: 'ACTIVE',
      });
      const ownPast = await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: MONDAY_0600,
        status: 'ACTIVE',
      });
      const otherPast = await insertBooking({
        userId: resident.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1400,
        status: 'ACTIVE',
      });
      const startedNow = await prisma.booking.create({
        data: {
          userId: admin.id,
          machineId: washer.id,
          startsAt: NOW,
          endsAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });
      const input = { houseId: house.id, now: NOW };

      await expect(
        cancelBooking({
          ...input,
          userId: resident.id,
          bookingId: upcoming.id,
          isAdmin: false,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
        message: 'You are not allowed to do that.',
      });
      await expect(
        cancelBooking({
          ...input,
          userId: resident.id,
          bookingId: ownPast.id,
          isAdmin: false,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
      await expect(
        cancelBooking({
          ...input,
          userId: admin.id,
          bookingId: ownPast.id,
          isAdmin: false,
        }),
      ).rejects.toMatchObject({
        code: 'SLOT_IN_PAST',
        status: 422,
        message: 'This slot has already started.',
      });
      await expect(
        cancelBooking({
          ...input,
          userId: admin.id,
          bookingId: otherPast.id,
          isAdmin: true,
        }),
      ).rejects.toMatchObject({ code: 'SLOT_IN_PAST', status: 422 });
      await expect(
        cancelBooking({
          ...input,
          userId: admin.id,
          bookingId: startedNow.id,
          isAdmin: false,
        }),
      ).rejects.toMatchObject({ code: 'SLOT_IN_PAST', status: 422 });

      await cancelBooking({
        ...input,
        userId: admin.id,
        bookingId: upcoming.id,
        isAdmin: false,
      });
      await cancelBooking({
        ...input,
        userId: admin.id,
        bookingId: affected.id,
        isAdmin: false,
      });
      await cancelBooking({
        ...input,
        userId: admin.id,
        bookingId: otherUpcoming.id,
        isAdmin: true,
      });

      expect(await prisma.booking.findUnique({ where: { id: upcoming.id } })).toBeNull();
      expect(await prisma.booking.findUnique({ where: { id: affected.id } })).toBeNull();
      expect(await prisma.booking.findUnique({ where: { id: otherUpcoming.id } })).toBeNull();
      expect(await prisma.booking.findUnique({ where: { id: ownPast.id } })).not.toBeNull();
      expect(await prisma.booking.findUnique({ where: { id: otherPast.id } })).not.toBeNull();
      expect(await prisma.booking.findUnique({ where: { id: startedNow.id } })).not.toBeNull();
    });
  });

  describe('DELETE /api/houses/:slug/bookings/:id', () => {
    it('frees the slot so the owner can book it again', async () => {
      const { ada, house, admin, washer } = await setup();
      const now = new Date();
      const slot = slotsAround(now).future[0];
      const booking = await insertSlot({ userId: admin.id, machineId: washer.id, slot });
      const removed = await ada.delete(bookingPath(house.slug, booking.id));
      const week = await ada.get(weekPath(house.slug, washer.id)).query({
        start: berlinDate(slot.startsAt),
      });
      const freed = week.body.slots.find(
        (candidate) => candidate.startsAt === slot.startsAt.toISOString(),
      );
      const again = await ada.post(bookingsPath(house.slug)).send({
        machineId: washer.id,
        startsAt: slot.startsAt.toISOString(),
      });

      expect(removed.status).toBe(204);
      expect(removed.text).toBe('');
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toBeNull();
      expect(freed).toEqual({
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        status: 'free',
      });
      expect(again.status).toBe(201);
      expect(again.body.startsAt).toBe(slot.startsAt.toISOString());
    });

    it('lets the owner cancel an upcoming affected booking', async () => {
      const { ada, house, admin, washer } = await setup();
      const slot = slotsAround(new Date()).future[0];
      const booking = await insertSlot({
        userId: admin.id,
        machineId: washer.id,
        slot,
        status: 'AFFECTED',
      });
      const removed = await ada.delete(bookingPath(house.slug, booking.id));

      expect(removed.status).toBe(204);
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toBeNull();
    });

    it('keeps the row when cancel is not allowed', async () => {
      const { ada, bea, house, admin, resident, washer } = await setup();
      const { past, future } = slotsAround(new Date());
      const ownUpcoming = await insertSlot({
        userId: admin.id,
        machineId: washer.id,
        slot: future[0],
      });
      const otherUpcoming = await insertSlot({
        userId: resident.id,
        machineId: washer.id,
        slot: future[1],
      });
      const ownPast = await insertSlot({
        userId: admin.id,
        machineId: washer.id,
        slot: past[0],
      });
      const otherPast = await insertSlot({
        userId: resident.id,
        machineId: washer.id,
        slot: past[1],
      });
      const residentUpcoming = await bea.delete(bookingPath(house.slug, ownUpcoming.id));
      const residentPast = await bea.delete(bookingPath(house.slug, ownPast.id));
      const ownerPast = await ada.delete(bookingPath(house.slug, ownPast.id));
      const adminPast = await ada.delete(bookingPath(house.slug, otherPast.id));
      const adminUpcoming = await ada.delete(bookingPath(house.slug, otherUpcoming.id));

      expect(residentUpcoming.status).toBe(403);
      expect(residentUpcoming.body).toEqual(FORBIDDEN);
      expect(residentPast.status).toBe(403);
      expect(residentPast.body).toEqual(FORBIDDEN);
      expect(ownerPast.status).toBe(422);
      expect(ownerPast.body).toEqual(SLOT_IN_PAST);
      expect(adminPast.status).toBe(422);
      expect(adminPast.body).toEqual(SLOT_IN_PAST);
      expect(adminUpcoming.status).toBe(204);
      expect(await prisma.booking.findUnique({ where: { id: ownUpcoming.id } })).not.toBeNull();
      expect(await prisma.booking.findUnique({ where: { id: ownPast.id } })).not.toBeNull();
      expect(await prisma.booking.findUnique({ where: { id: otherPast.id } })).not.toBeNull();
      expect(await prisma.booking.findUnique({ where: { id: otherUpcoming.id } })).toBeNull();
    });

    it('returns the same 404 and 401', async () => {
      const { ada, bea, house, admin, washer } = await setup({ joinResident: false });
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const other = await createNamedHouse(cy, 'Other');
      const foreign = await createMachine(cy, other.slug, 'Other washer', 'WASHER');
      const slot = slotsAround(new Date()).future[0];
      const booking = await insertSlot({ userId: admin.id, machineId: washer.id, slot });
      const foreignUser = await prisma.user.findUnique({ where: { email: 'cy@example.com' } });
      const foreignBooking = await insertSlot({
        userId: foreignUser.id,
        machineId: foreign.id,
        slot,
      });
      const loggedOut = await request(app).delete(bookingPath(house.slug, booking.id));
      const outsider = await bea.delete(bookingPath(house.slug, booking.id));
      const unknown = await ada.delete(bookingPath(house.slug, 'missing-booking'));
      const fromOtherHouse = await ada.delete(bookingPath(house.slug, foreignBooking.id));

      expect(loggedOut.status).toBe(401);
      expect(loggedOut.body).toEqual(UNAUTHENTICATED);
      expect(outsider.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(fromOtherHouse.status).toBe(404);
      expect(outsider.body).toEqual(NOT_FOUND);
      expect(unknown.body).toEqual(outsider.body);
      expect(fromOtherHouse.body).toEqual(outsider.body);
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).not.toBeNull();
      expect(await prisma.booking.findUnique({ where: { id: foreignBooking.id } })).not.toBeNull();
    });
  });
});
