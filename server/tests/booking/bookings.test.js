import { DateTime } from 'luxon';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { createLoginRateLimit } from '../../src/middleware/login-rate-limit.js';
import { createBooking } from '../../src/modules/booking/service.js';
import {
  generateWeekSlots,
  isSlotInPast,
  validateBookingWindow,
} from '../../src/modules/slots/slots.js';
import { BERLIN_ZONE } from '../../src/modules/slots/time.js';
import { resetDatabase } from '../helpers/reset-database.js';

const PASSWORD = 'correct-horse';
const RULE_NOW = new Date('2026-04-01T13:00:00.000Z');
const WEDNESDAY_1600 = '2026-04-01T14:00:00.000Z';
const WEDNESDAY_1800 = '2026-04-01T16:00:00.000Z';
const WEDNESDAY_2000 = '2026-04-01T18:00:00.000Z';
const THURSDAY_0600 = '2026-04-02T04:00:00.000Z';
const THURSDAY_0800 = '2026-04-02T06:00:00.000Z';
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Not found.' } };

const app = createApp({
  auth: {
    loginRateLimit: createLoginRateLimit({ limit: 1000 }),
  },
});

function bookingsPath(slug) {
  return `/api/houses/${slug}/bookings`;
}

function slotByStart(startsAt) {
  const startMs = new Date(startsAt).getTime();
  const slot = generateWeekSlots(startsAt).find(
    (candidate) => candidate.startsAt.getTime() === startMs,
  );

  if (!slot) {
    throw new Error(`No slot starts at ${startsAt}`);
  }

  return slot;
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

function toBerlinOffset(date) {
  return DateTime.fromJSDate(date, { zone: BERLIN_ZONE }).toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
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

async function setup({ joinResident = true } = {}) {
  const ada = await registerAndLogin('ada@example.com', 'Ada');
  const bea = await registerAndLogin('bea@example.com', 'Bea');
  const house = await createNamedHouse(ada, 'Haus');

  if (joinResident) {
    const joined = await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

    expect(joined.status).toBe(201);
  }

  const admin = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
  const resident = await prisma.user.findUnique({ where: { email: 'bea@example.com' } });
  const washer = await createMachine(ada, house.slug, 'Washer', 'WASHER');
  const dryer = await createMachine(ada, house.slug, 'Dryer', 'DRYER');

  return { ada, bea, house, admin, resident, washer, dryer };
}

async function insertBooking({ userId, machineId, startsAt, status }) {
  const slot = slotByStart(startsAt);

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

function ruleInput({ userId, houseId, machineId, startsAt, now = RULE_NOW }) {
  return { userId, houseId, machineId, startsAt, now };
}

describe('bookings', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('POST /api/houses/:slug/bookings', () => {
    it('stores the generated endsAt for the earliest open slot', async () => {
      const { ada, house, washer, dryer } = await setup();
      const slot = earliestBookableSlot(new Date());
      const created = await ada.post(bookingsPath(house.slug)).send({
        machineId: washer.id,
        startsAt: slot.startsAt.toISOString(),
      });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        machineId: washer.id,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        status: 'ACTIVE',
      });
      expect(created.body).not.toHaveProperty('userId');

      const row = await prisma.booking.findUnique({ where: { id: created.body.id } });

      expect(row.endsAt.toISOString()).toBe(slot.endsAt.toISOString());

      const withOffset = await ada.post(bookingsPath(house.slug)).send({
        machineId: dryer.id,
        startsAt: toBerlinOffset(slot.startsAt),
      });

      expect(withOffset.status).toBe(201);
      expect(withOffset.body.startsAt).toBe(slot.startsAt.toISOString());
      expect(withOffset.body.endsAt).toBe(slot.endsAt.toISOString());
    });

    it('returns 401 when there is no session', async () => {
      const { house, washer } = await setup();
      const slot = earliestBookableSlot(new Date());
      const response = await request(app).post(bookingsPath(house.slug)).send({
        machineId: washer.id,
        startsAt: slot.startsAt.toISOString(),
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'You need to log in.' },
      });
    });

    it('returns the same 404 for a non-member and an unknown slug', async () => {
      const { bea, house, washer } = await setup({ joinResident: false });
      const slot = earliestBookableSlot(new Date());
      const body = { machineId: washer.id, startsAt: slot.startsAt.toISOString() };
      const outsider = await bea.post(bookingsPath(house.slug)).send(body);
      const missing = await bea.post(bookingsPath('missing')).send(body);
      const invalidBody = await bea.post(bookingsPath(house.slug)).send({ machineId: washer.id });

      expect(outsider.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(invalidBody.status).toBe(404);
      expect(outsider.body).toEqual(NOT_FOUND);
      expect(missing.body).toEqual(outsider.body);
      expect(invalidBody.body).toEqual(outsider.body);
    });

    it('returns the same 404 for an unknown machine and another house', async () => {
      const { ada, house } = await setup();
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const other = await createNamedHouse(cy, 'Other');
      const foreign = await createMachine(cy, other.slug, 'Other washer', 'WASHER');
      const slot = earliestBookableSlot(new Date());
      const unknown = await ada.post(bookingsPath(house.slug)).send({
        machineId: 'missing-machine',
        startsAt: slot.startsAt.toISOString(),
      });
      const fromOtherHouse = await ada.post(bookingsPath(house.slug)).send({
        machineId: foreign.id,
        startsAt: slot.startsAt.toISOString(),
      });

      expect(unknown.status).toBe(404);
      expect(fromOtherHouse.status).toBe(404);
      expect(unknown.body).toEqual(NOT_FOUND);
      expect(fromOtherHouse.body).toEqual(unknown.body);
    });

    it('returns 400 for a missing field, an extra field, a bad slug, and no offset', async () => {
      const { ada, house, washer } = await setup();
      const startsAt = earliestBookableSlot(new Date()).startsAt.toISOString();
      const missing = await ada.post(bookingsPath(house.slug)).send({ machineId: washer.id });
      const extra = await ada.post(bookingsPath(house.slug)).send({
        machineId: washer.id,
        startsAt,
        note: 'extra',
      });
      const badSlug = await ada.post(bookingsPath('NOPE')).send({
        machineId: washer.id,
        startsAt,
      });
      const noOffset = await ada.post(bookingsPath(house.slug)).send({
        machineId: washer.id,
        startsAt: '2026-04-01T16:00:00',
      });

      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe('VALIDATION_ERROR');
      expect(extra.status).toBe(400);
      expect(extra.body.error.code).toBe('VALIDATION_ERROR');
      expect(badSlug.status).toBe(400);
      expect(badSlug.body.error.code).toBe('VALIDATION_ERROR');
      expect(noOffset.status).toBe(400);
      expect(noOffset.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a broken machine and still books one that works', async () => {
      const { ada, house, washer, dryer } = await setup();
      const slot = earliestBookableSlot(new Date());

      await prisma.machine.update({
        where: { id: washer.id },
        data: { isBroken: true },
      });

      const broken = await ada.post(bookingsPath(house.slug)).send({
        machineId: washer.id,
        startsAt: slot.startsAt.toISOString(),
      });
      const working = await ada.post(bookingsPath(house.slug)).send({
        machineId: dryer.id,
        startsAt: slot.startsAt.toISOString(),
      });

      expect(broken.status).toBe(409);
      expect(broken.body).toEqual({
        error: { code: 'MACHINE_BROKEN', message: 'This machine is broken.' },
      });
      expect(working.status).toBe(201);
      expect(working.body.machineId).toBe(dryer.id);
      expect(await prisma.booking.count({ where: { machineId: washer.id } })).toBe(0);
    });
  });

  describe('createBooking', () => {
    it('returns an active booking for an admin and a resident', async () => {
      const { house, admin, resident, washer, dryer } = await setup();
      const slot = slotByStart(WEDNESDAY_1600);
      const adminBooking = await createBooking(
        ruleInput({
          userId: admin.id,
          houseId: house.id,
          machineId: washer.id,
          startsAt: WEDNESDAY_1600,
        }),
      );
      const residentBooking = await createBooking(
        ruleInput({
          userId: resident.id,
          houseId: house.id,
          machineId: dryer.id,
          startsAt: '2026-04-01T16:00:00+02:00',
        }),
      );
      const stored = await prisma.booking.findMany({ orderBy: { createdAt: 'asc' } });

      expect(slot.endsAt.toISOString()).toBe('2026-04-01T16:00:00.000Z');
      expect(adminBooking).toMatchObject({
        machineId: washer.id,
        status: 'ACTIVE',
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      expect(adminBooking).not.toHaveProperty('userId');
      expect(residentBooking).toMatchObject({
        machineId: dryer.id,
        status: adminBooking.status,
        startsAt: adminBooking.startsAt,
        endsAt: adminBooking.endsAt,
      });
      expect(residentBooking).not.toHaveProperty('userId');
      expect(stored).toHaveLength(2);
      expect(stored[0].startsAt.toISOString()).toBe(WEDNESDAY_1600);
      expect(stored[0].endsAt.toISOString()).toBe('2026-04-01T16:00:00.000Z');
      expect(stored[1].startsAt.toISOString()).toBe(WEDNESDAY_1600);
      expect(stored[1].endsAt.toISOString()).toBe('2026-04-01T16:00:00.000Z');
    });

    it('rejects a time between slots, Sunday, and Saturday closing', async () => {
      const { house, admin, washer } = await setup();
      const starts = [
        '2026-04-01T15:00:00.000Z',
        '2026-04-05T04:00:00.000Z',
        '2026-03-28T21:00:00.000Z',
      ];

      for (const startsAt of starts) {
        await expect(
          createBooking(
            ruleInput({
              userId: admin.id,
              houseId: house.id,
              machineId: washer.id,
              startsAt,
            }),
          ),
        ).rejects.toEqual(
          expect.objectContaining({
            name: 'AppError',
            code: 'OUTSIDE_OPENING_HOURS',
            status: 422,
            message: 'This time is outside opening hours.',
          }),
        );
      }

      expect(await prisma.booking.count()).toBe(0);
    });

    it('rejects a start outside the booking window', async () => {
      const { house, admin, washer } = await setup();
      const starts = ['2026-03-28T19:00:00.000Z', '2026-04-27T04:00:00.000Z'];

      for (const startsAt of starts) {
        await expect(
          createBooking(
            ruleInput({
              userId: admin.id,
              houseId: house.id,
              machineId: washer.id,
              startsAt,
            }),
          ),
        ).rejects.toEqual(
          expect.objectContaining({
            name: 'AppError',
            code: 'OUTSIDE_BOOKING_WINDOW',
            status: 422,
            message: 'This time is outside the booking window.',
          }),
        );
      }
    });

    it('rejects a past slot inside the window and a slot that starts at now', async () => {
      const { house, admin, washer } = await setup();
      const input = {
        userId: admin.id,
        houseId: house.id,
        machineId: washer.id,
      };

      await expect(
        createBooking(ruleInput({ ...input, startsAt: '2026-03-30T04:00:00.000Z' })),
      ).rejects.toMatchObject({
        code: 'SLOT_IN_PAST',
        status: 422,
        message: 'This slot has already started.',
      });
      await expect(
        createBooking(
          ruleInput({
            ...input,
            startsAt: WEDNESDAY_1600,
            now: new Date(WEDNESDAY_1600),
          }),
        ),
      ).rejects.toMatchObject({
        code: 'SLOT_IN_PAST',
        status: 422,
        message: 'This slot has already started.',
      });
    });

    it('rejects a third upcoming active booking in the house', async () => {
      const { house, admin, washer, dryer } = await setup();
      const input = { userId: admin.id, houseId: house.id };

      await createBooking(ruleInput({ ...input, machineId: washer.id, startsAt: WEDNESDAY_1600 }));
      await createBooking(ruleInput({ ...input, machineId: dryer.id, startsAt: WEDNESDAY_1800 }));

      await expect(
        createBooking(ruleInput({ ...input, machineId: washer.id, startsAt: WEDNESDAY_2000 })),
      ).rejects.toMatchObject({
        code: 'BOOKING_LIMIT',
        status: 409,
        message: 'You already have 2 upcoming bookings.',
      });
      expect(await prisma.booking.count({ where: { userId: admin.id } })).toBe(2);
    });

    it('does not count upcoming affected bookings', async () => {
      const { house, admin, washer } = await setup();

      await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1600,
        status: 'AFFECTED',
      });
      await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: WEDNESDAY_1800,
        status: 'AFFECTED',
      });

      const created = await createBooking(
        ruleInput({
          userId: admin.id,
          houseId: house.id,
          machineId: washer.id,
          startsAt: WEDNESDAY_2000,
        }),
      );

      expect(created.status).toBe('ACTIVE');
      expect(created.startsAt.toISOString()).toBe(WEDNESDAY_2000);
    });

    it('does not count active bookings that have already started', async () => {
      const { house, admin, washer } = await setup();

      await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: '2026-03-30T04:00:00.000Z',
        status: 'ACTIVE',
      });
      await insertBooking({
        userId: admin.id,
        machineId: washer.id,
        startsAt: '2026-03-31T04:00:00.000Z',
        status: 'ACTIVE',
      });

      const created = await createBooking(
        ruleInput({
          userId: admin.id,
          houseId: house.id,
          machineId: washer.id,
          startsAt: WEDNESDAY_1600,
        }),
      );

      expect(created.status).toBe('ACTIVE');
      expect(await prisma.booking.count({ where: { userId: admin.id, status: 'ACTIVE' } })).toBe(3);
    });

    it('allows one more active booking beside affected ones', async () => {
      const { house, admin, washer } = await setup();
      const input = { userId: admin.id, houseId: house.id, machineId: washer.id };

      await createBooking(ruleInput({ ...input, startsAt: WEDNESDAY_1600 }));
      await insertBooking({ ...input, startsAt: WEDNESDAY_1800, status: 'AFFECTED' });
      await insertBooking({ ...input, startsAt: WEDNESDAY_2000, status: 'AFFECTED' });
      await insertBooking({ ...input, startsAt: THURSDAY_0600, status: 'AFFECTED' });

      const created = await createBooking(ruleInput({ ...input, startsAt: THURSDAY_0800 }));
      const active = await prisma.booking.count({
        where: { userId: admin.id, status: 'ACTIVE' },
      });

      expect(created.status).toBe('ACTIVE');
      expect(active).toBe(2);
    });

    it('rejects a second booking for the same slot without dropping the first', async () => {
      const { house, admin, resident, washer } = await setup();
      const input = { houseId: house.id, machineId: washer.id, startsAt: WEDNESDAY_1600 };
      const first = await createBooking(ruleInput({ ...input, userId: admin.id }));

      await expect(
        createBooking(ruleInput({ ...input, userId: resident.id })),
      ).rejects.toMatchObject({
        code: 'SLOT_TAKEN',
        status: 409,
        message: 'This slot is already booked.',
      });

      const rows = await prisma.booking.findMany({ where: { machineId: washer.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(first.id);
      expect(rows[0].userId).toBe(admin.id);
    });
  });
});
