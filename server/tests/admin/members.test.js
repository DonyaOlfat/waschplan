import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { createLoginRateLimit } from '../../src/middleware/login-rate-limit.js';
import { removeMember } from '../../src/modules/admin/service.js';
import { INVITE_ALPHABET } from '../../src/modules/house/invite-code.js';
import { resetDatabase } from '../helpers/reset-database.js';

const PASSWORD = 'correct-horse';
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Not found.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You are not allowed to do that.' } };
const UNAUTHENTICATED = { error: { code: 'UNAUTHENTICATED', message: 'You need to log in.' } };
const LAST_ADMIN = {
  error: { code: 'LAST_ADMIN', message: 'A house must keep at least one admin.' },
};
const INVALID_INVITE_CODE = {
  error: { code: 'INVALID_INVITE_CODE', message: 'This invite code is not valid.' },
};

const app = createApp({
  auth: {
    loginRateLimit: createLoginRateLimit({ limit: 1000 }),
  },
});

function membersPath(slug, userId) {
  const path = `/api/houses/${slug}/members`;
  return userId ? `${path}/${userId}` : path;
}

function invitePath(slug) {
  return `/api/houses/${slug}/invite-code`;
}

function bookingRow(machineId, userId, startsAt, status) {
  return {
    machineId,
    userId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60_000),
    status,
  };
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

async function setup() {
  const ada = await registerAndLogin('ada@example.com', 'Ada');
  const bea = await registerAndLogin('bea@example.com', 'Bea');
  const house = await createNamedHouse(ada, 'Haus');
  const joined = await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

  expect(joined.status).toBe(201);

  const admin = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
  const resident = await prisma.user.findUnique({ where: { email: 'bea@example.com' } });

  return { ada, bea, house, admin, resident };
}

async function requestAll(actor, slug, userId) {
  return [
    await actor.get(membersPath(slug)),
    await actor.post(invitePath(slug)),
    await actor.patch(membersPath(slug, userId)).send({ role: 'RESIDENT' }),
    await actor.delete(membersPath(slug, userId)),
  ];
}

function expectResponses(responses, status, body) {
  for (const response of responses) {
    expect(response.status).toBe(status);
    expect(response.body).toEqual(body);
  }
}

async function memberships() {
  return prisma.membership.findMany({ orderBy: { userId: 'asc' } });
}

describe('admin members', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('access', () => {
    it('returns 401 on every member route when logged out', async () => {
      const { house, admin } = await setup();
      const responses = await requestAll(request(app), house.slug, admin.id);

      expectResponses(responses, 401, UNAUTHENTICATED);
    });

    it('returns 403 for a resident and leaves the code, roles, and memberships unchanged', async () => {
      const { bea, house, admin } = await setup();
      const before = await memberships();
      const beforeCode = house.inviteCode;
      const responses = await requestAll(bea, house.slug, admin.id);
      const after = await memberships();
      const stored = await prisma.house.findUnique({ where: { id: house.id } });

      expectResponses(responses, 403, FORBIDDEN);
      expect(after).toEqual(before);
      expect(after.map((membership) => membership.role).sort()).toEqual(['ADMIN', 'RESIDENT']);
      expect(stored.inviteCode).toBe(beforeCode);
    });

    it('returns 404 for a non-member and a member of another house', async () => {
      const { house, admin } = await setup();
      const outsider = await registerAndLogin('outsider@example.com', 'Outsider');
      const cy = await registerAndLogin('cy@example.com', 'Cy');

      await createNamedHouse(cy, 'Other');

      const missing = await requestAll(outsider, house.slug, admin.id);
      const otherHouse = await requestAll(cy, house.slug, admin.id);

      expectResponses(missing, 404, NOT_FOUND);
      expectResponses(otherHouse, 404, NOT_FOUND);
      expect(await prisma.membership.count()).toBe(3);
      expect((await prisma.house.findUnique({ where: { id: house.id } })).inviteCode).toBe(
        house.inviteCode,
      );
    });
  });

  describe('GET /api/houses/:slug/members', () => {
    it('lists this house only, creator first, without a password hash', async () => {
      const { ada, house, admin, resident } = await setup();
      const cy = await registerAndLogin('cy@example.com', 'Cy');

      await createNamedHouse(cy, 'Other');

      const response = await ada.get(membersPath(house.slug));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          userId: admin.id,
          name: 'Ada',
          email: 'ada@example.com',
          role: 'ADMIN',
        },
        {
          userId: resident.id,
          name: 'Bea',
          email: 'bea@example.com',
          role: 'RESIDENT',
        },
      ]);
      expect(response.text).not.toContain('passwordHash');
    });
  });

  describe('POST /api/houses/:slug/invite-code', () => {
    it('rejects the old code and accepts the new one', async () => {
      const { ada, house } = await setup();
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const regenerated = await ada.post(invitePath(house.slug));
      const stored = await prisma.house.findUnique({ where: { id: house.id } });
      const oldJoin = await cy.post('/api/houses/join').send({ inviteCode: house.inviteCode });
      const newJoin = await cy.post('/api/houses/join').send({
        inviteCode: regenerated.body.inviteCode,
      });

      expect(regenerated.status).toBe(200);
      expect(regenerated.body).toMatchObject({
        id: house.id,
        name: 'Haus',
        slug: house.slug,
        role: 'ADMIN',
      });
      expect(regenerated.body.inviteCode).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{6}$`));
      expect(regenerated.body.inviteCode).not.toBe(house.inviteCode);
      expect(stored.inviteCode).toBe(regenerated.body.inviteCode);
      expect(oldJoin.status).toBe(404);
      expect(oldJoin.body).toEqual(INVALID_INVITE_CODE);
      expect(newJoin.status).toBe(201);
      expect(newJoin.body.role).toBe('RESIDENT');
      expect(newJoin.body.inviteCode).toBe(regenerated.body.inviteCode);
    });
  });

  describe('PATCH /api/houses/:slug/members/:userId', () => {
    it('rejects demoting the only admin', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const admin = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const response = await ada
        .patch(membersPath(house.slug, admin.id))
        .send({ role: 'RESIDENT' });
      const membership = await prisma.membership.findUnique({ where: { userId: admin.id } });

      expect(response.status).toBe(409);
      expect(response.body).toEqual(LAST_ADMIN);
      expect(membership.role).toBe('ADMIN');
    });

    it('promotes a resident, demotes one admin, and rejects a bad role', async () => {
      const { ada, bea, house, admin, resident } = await setup();
      const promoted = await ada
        .patch(membersPath(house.slug, resident.id))
        .send({ role: 'ADMIN' });

      expect(promoted.status).toBe(200);
      expect(promoted.body).toEqual({
        userId: resident.id,
        name: 'Bea',
        email: 'bea@example.com',
        role: 'ADMIN',
      });

      const demoted = await ada
        .patch(membersPath(house.slug, resident.id))
        .send({ role: 'RESIDENT' });
      const list = await bea.get(membersPath(house.slug));
      const details = await bea.get(`/api/houses/${house.slug}`);

      expect(demoted.status).toBe(200);
      expect(demoted.body.role).toBe('RESIDENT');
      expect(list.status).toBe(403);
      expect(list.body).toEqual(FORBIDDEN);
      expect(details.status).toBe(200);

      const same = await ada.patch(membersPath(house.slug, resident.id)).send({ role: 'RESIDENT' });
      const missing = await ada
        .patch(membersPath(house.slug, 'missing-user'))
        .send({ role: 'ADMIN' });
      const lower = await ada.patch(membersPath(house.slug, admin.id)).send({ role: 'resident' });
      const extra = await ada
        .patch(membersPath(house.slug, admin.id))
        .send({ role: 'RESIDENT', note: 'nope' });
      const membership = await prisma.membership.findUnique({ where: { userId: admin.id } });

      expect(same.status).toBe(200);
      expect(same.body.role).toBe('RESIDENT');
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual(NOT_FOUND);
      expect(lower.status).toBe(400);
      expect(lower.body.error.code).toBe('VALIDATION_ERROR');
      expect(extra.status).toBe(400);
      expect(extra.body.error.code).toBe('VALIDATION_ERROR');
      expect(membership.role).toBe('ADMIN');
    });
  });

  describe('DELETE /api/houses/:slug/members/:userId', () => {
    it('deletes the resident future bookings and removes access', async () => {
      const { ada, bea, house, admin, resident } = await setup();
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const futureActive = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const futureAffected = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const otherFuture = new Date(Date.now() + 4 * 60 * 60 * 1000);

      await prisma.booking.createMany({
        data: [
          bookingRow(machine.id, resident.id, past, 'ACTIVE'),
          bookingRow(machine.id, resident.id, futureActive, 'ACTIVE'),
          bookingRow(machine.id, resident.id, futureAffected, 'AFFECTED'),
          bookingRow(machine.id, admin.id, otherFuture, 'ACTIVE'),
        ],
      });

      const response = await ada.delete(membersPath(house.slug, resident.id));
      const remaining = await prisma.booking.findMany({ orderBy: { startsAt: 'asc' } });
      const user = await prisma.user.findUnique({ where: { id: resident.id } });
      const me = await bea.get('/api/auth/me');
      const houseResponse = await bea.get(`/api/houses/${house.slug}`);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(remaining).toHaveLength(2);
      expect(remaining[0]).toMatchObject({ userId: resident.id, startsAt: past, status: 'ACTIVE' });
      expect(remaining[1]).toMatchObject({
        userId: admin.id,
        startsAt: otherFuture,
        status: 'ACTIVE',
      });
      expect(user.email).toBe('bea@example.com');
      expect(me.status).toBe(200);
      expect(me.body.houseSlug).toBeNull();
      expect(me.body.role).toBeNull();
      expect(houseResponse.status).toBe(404);
      expect(houseResponse.body).toEqual(NOT_FOUND);
    });

    it('keeps a booking that starts at now and deletes one a millisecond later', async () => {
      const { house, resident } = await setup();
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const now = new Date('2026-06-15T10:00:00.000Z');
      const justAfter = new Date(now.getTime() + 1);

      await prisma.booking.createMany({
        data: [
          bookingRow(machine.id, resident.id, now, 'ACTIVE'),
          bookingRow(machine.id, resident.id, justAfter, 'ACTIVE'),
        ],
      });

      await removeMember({ houseId: house.id, userId: resident.id, now });

      const remaining = await prisma.booking.findMany();

      expect(remaining).toHaveLength(1);
      expect(remaining[0].startsAt).toEqual(now);
      expect(remaining[0].userId).toBe(resident.id);
    });

    it('keeps the only admin and their future booking', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const admin = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const startsAt = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.booking.create({
        data: bookingRow(machine.id, admin.id, startsAt, 'ACTIVE'),
      });

      const response = await ada.delete(membersPath(house.slug, admin.id));
      const membership = await prisma.membership.findUnique({ where: { userId: admin.id } });
      const booking = await prisma.booking.findFirst({ where: { userId: admin.id } });

      expect(response.status).toBe(409);
      expect(response.body).toEqual(LAST_ADMIN);
      expect(membership.role).toBe('ADMIN');
      expect(booking.startsAt).toEqual(startsAt);
    });

    it('lets an admin remove themselves when another admin remains', async () => {
      const { ada, house, admin, resident } = await setup();
      const promoted = await ada
        .patch(membersPath(house.slug, resident.id))
        .send({ role: 'ADMIN' });
      const response = await ada.delete(membersPath(house.slug, admin.id));
      const remaining = await prisma.membership.findMany();
      const next = await ada.get(`/api/houses/${house.slug}`);

      expect(promoted.status).toBe(200);
      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatchObject({ userId: resident.id, role: 'ADMIN' });
      expect(next.status).toBe(404);
      expect(next.body).toEqual(NOT_FOUND);
    });

    it('returns 404 for an unknown user and deletes nothing', async () => {
      const { ada, house, admin } = await setup();
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const startsAt = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.booking.create({
        data: bookingRow(machine.id, admin.id, startsAt, 'ACTIVE'),
      });

      const membershipsBefore = await memberships();
      const bookingsBefore = await prisma.booking.findMany({ orderBy: { startsAt: 'asc' } });
      const response = await ada.delete(membersPath(house.slug, 'missing-user'));

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
      expect(await memberships()).toEqual(membershipsBefore);
      expect(await prisma.booking.findMany({ orderBy: { startsAt: 'asc' } })).toEqual(
        bookingsBefore,
      );
    });
  });
});
