import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { createLoginRateLimit } from '../../src/middleware/login-rate-limit.js';
import {
  generateWeekSlots,
  isSlotInPast,
  validateBookingWindow,
} from '../../src/modules/slots/slots.js';
import { resetDatabase } from '../helpers/reset-database.js';

const PASSWORD = 'correct-horse';
const SLOT_MARGIN_MS = 60 * 1000;

const app = createApp({
  auth: {
    loginRateLimit: createLoginRateLimit({ limit: 1000 }),
  },
});

function bookingsPath(slug) {
  return `/api/houses/${slug}/bookings`;
}

function bookableSlots(now, count) {
  const found = [];
  let instant = now;

  for (let week = 0; week < 4 && found.length < count; week += 1) {
    const slots = generateWeekSlots(instant);

    for (const slot of slots) {
      const startsLater = slot.startsAt.getTime() - now.getTime() > SLOT_MARGIN_MS;
      const inWindow = validateBookingWindow(slot.startsAt, now).ok;

      if (startsLater && inWindow && !isSlotInPast(slot.startsAt, now)) {
        found.push(slot);
      }

      if (found.length === count) {
        return found;
      }
    }

    instant = new Date(slots.at(-1).endsAt.getTime() + 2 * 24 * 60 * 60 * 1000);
  }

  throw new Error(`Needed ${count} bookable slots.`);
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

async function setup() {
  const ada = await registerAndLogin('ada@example.com', 'Ada');
  const bea = await registerAndLogin('bea@example.com', 'Bea');
  const house = await ada.post('/api/houses').send({ name: 'Haus' });

  expect(house.status).toBe(201);

  const joined = await bea.post('/api/houses/join').send({ inviteCode: house.body.inviteCode });

  expect(joined.status).toBe(201);

  const washer = await ada.post(`/api/houses/${house.body.slug}/machines`).send({
    name: 'Washer',
    type: 'WASHER',
  });

  expect(washer.status).toBe(201);

  const admin = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });

  return { ada, bea, house: house.body, washer: washer.body, admin };
}

describe('concurrent bookings', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('lets one of two members book a slot', async () => {
    const { ada, bea, house, washer } = await setup();
    const [slot] = bookableSlots(new Date(), 1);
    const startsAt = slot.startsAt.toISOString();
    const body = { machineId: washer.id, startsAt };
    const responses = await Promise.all([
      ada.post(bookingsPath(house.slug)).send(body),
      bea.post(bookingsPath(house.slug)).send(body),
    ]);
    const statuses = responses
      .map((response) => response.status)
      .sort((left, right) => left - right);
    const taken = responses.find((response) => response.status === 409);

    expect(statuses).toEqual([201, 409]);
    expect(taken.body).toEqual({
      error: { code: 'SLOT_TAKEN', message: 'This slot is already booked.' },
    });

    const rows = await prisma.booking.findMany({ where: { machineId: washer.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0].startsAt.toISOString()).toBe(startsAt);
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('lets one member keep two of three simultaneous bookings', async () => {
    const { ada, house, washer, admin } = await setup();
    const slots = bookableSlots(new Date(), 3);
    const responses = await Promise.all(
      slots.map((slot) =>
        ada.post(bookingsPath(house.slug)).send({
          machineId: washer.id,
          startsAt: slot.startsAt.toISOString(),
        }),
      ),
    );
    const statuses = responses
      .map((response) => response.status)
      .sort((left, right) => left - right);
    const limited = responses.find((response) => response.status === 409);

    expect(statuses).toEqual([201, 201, 409]);
    expect(limited.body).toEqual({
      error: { code: 'BOOKING_LIMIT', message: 'You already have 2 upcoming bookings.' },
    });
    expect(await prisma.booking.count({ where: { userId: admin.id, status: 'ACTIVE' } })).toBe(2);
  });
});
