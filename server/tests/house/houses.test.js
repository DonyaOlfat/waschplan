import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { INVITE_ALPHABET } from '../../src/modules/house/invite-code.js';
import { createLoginRateLimit } from '../../src/middleware/login-rate-limit.js';
import { requireAdmin, requireMember } from '../../src/middleware/require-member.js';
import { requireAuth } from '../../src/middleware/require-auth.js';
import { resetDatabase } from '../helpers/reset-database.js';

const PASSWORD = 'correct-horse';

const app = createApp({
  auth: {
    loginRateLimit: createLoginRateLimit({ limit: 1000 }),
  },
  configure(configured) {
    configured.post(
      '/api/houses/:slug/admin-check',
      requireAuth,
      requireMember,
      requireAdmin,
      (req, res) => {
        res.status(204).send();
      },
    );
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

describe('houses', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('POST /api/houses', () => {
    it('creates a house and makes the creator admin', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const response = await ada.post('/api/houses').send({ name: '  Wittensteinstraße 12  ' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Wittensteinstraße 12',
        slug: 'wittensteinstr-12',
        role: 'ADMIN',
      });
      expect(response.body.inviteCode).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{6}$`));
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');

      const user = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const houses = await prisma.house.findMany();
      const memberships = await prisma.membership.findMany();

      expect(houses).toHaveLength(1);
      expect(memberships).toEqual([
        expect.objectContaining({
          userId: user.id,
          houseId: houses[0].id,
          role: 'ADMIN',
        }),
      ]);

      const me = await ada.get('/api/auth/me');

      expect(me.status).toBe(200);
      expect(me.body.houseSlug).toBe('wittensteinstr-12');
      expect(me.body.role).toBe('ADMIN');
    });

    it('suffixes a duplicate name and rejects a second house for the same user', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const first = await createNamedHouse(ada, 'Haus');
      const second = await bea.post('/api/houses').send({ name: 'Haus' });
      const again = await ada.post('/api/houses').send({ name: 'Other' });

      expect(first.slug).toBe('haus');
      expect(second.status).toBe(201);
      expect(second.body.slug).toBe('haus-2');
      expect(again.status).toBe(409);
      expect(again.body).toEqual({
        error: {
          code: 'ALREADY_IN_HOUSE',
          message: 'You are already in a house.',
        },
      });
      expect(await prisma.house.count()).toBe(2);
    });
  });

  describe('POST /api/houses/join', () => {
    it('joins with a lowercase invite code as a resident', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const house = await createNamedHouse(ada, 'Haus');
      const response = await bea.post('/api/houses/join').send({
        inviteCode: house.inviteCode.toLowerCase(),
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        slug: 'haus',
        role: 'RESIDENT',
        inviteCode: house.inviteCode,
      });

      const resident = await prisma.user.findUnique({ where: { email: 'bea@example.com' } });
      const membership = await prisma.membership.findUnique({ where: { userId: resident.id } });

      expect(membership.role).toBe('RESIDENT');

      const me = await bea.get('/api/auth/me');

      expect(me.body.houseSlug).toBe('haus');
      expect(me.body.role).toBe('RESIDENT');
    });

    it('rejects a member even when the invite code is unknown', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');

      await createNamedHouse(ada, 'Haus');

      const response = await ada.post('/api/houses/join').send({ inviteCode: 'ABCDEF' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ALREADY_IN_HOUSE');
      expect(await prisma.membership.count()).toBe(1);
    });

    it('rejects an unknown code and a code outside the alphabet', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const unknown = await ada.post('/api/houses/join').send({ inviteCode: 'ABCDEF' });
      const ambiguous = await ada.post('/api/houses/join').send({ inviteCode: 'O0I1L!' });
      const short = await ada.post('/api/houses/join').send({ inviteCode: 'ABC' });

      expect(unknown.status).toBe(404);
      expect(unknown.body).toEqual({
        error: {
          code: 'INVALID_INVITE_CODE',
          message: 'This invite code is not valid.',
        },
      });
      expect(ambiguous.status).toBe(400);
      expect(ambiguous.body.error.code).toBe('VALIDATION_ERROR');
      expect(short.status).toBe(400);
      expect(short.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/houses/:slug', () => {
    it('returns the house to a member', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const created = await createNamedHouse(ada, 'Haus');
      const response = await ada.get('/api/houses/haus');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: created.id,
        name: 'Haus',
        slug: 'haus',
        inviteCode: created.inviteCode,
        role: 'ADMIN',
      });
    });

    it('returns the same 404 for a non-member and an unknown slug', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');

      await createNamedHouse(ada, 'Haus');

      const outsider = await bea.get('/api/houses/haus');
      const missing = await bea.get('/api/houses/missing');
      const loggedOut = await request(app).get('/api/houses/haus');

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

  describe('admin guard', () => {
    it('allows an admin and rejects a resident and a non-member', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const cy = await registerAndLogin('cy@example.com', 'Cy');
      const house = await createNamedHouse(ada, 'Haus');

      await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

      const admin = await ada.post('/api/houses/haus/admin-check');
      const resident = await bea.post('/api/houses/haus/admin-check');
      const outsider = await cy.post('/api/houses/haus/admin-check');

      expect(admin.status).toBe(204);
      expect(resident.status).toBe(403);
      expect(resident.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'You are not allowed to do that.' },
      });
      expect(outsider.status).toBe(404);
      expect(outsider.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/houses/:slug/leave', () => {
    it('deletes the resident future bookings and keeps the past one', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');
      const house = await createNamedHouse(ada, 'Haus');

      await bea.post('/api/houses/join').send({ inviteCode: house.inviteCode });

      const resident = await prisma.user.findUnique({ where: { email: 'bea@example.com' } });
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 60 * 60 * 1000);
      const later = new Date(Date.now() + 2 * 60 * 60 * 1000);

      await prisma.booking.createMany({
        data: [
          {
            machineId: machine.id,
            userId: resident.id,
            startsAt: past,
            endsAt: new Date(past.getTime() + 60_000),
            status: 'ACTIVE',
          },
          {
            machineId: machine.id,
            userId: resident.id,
            startsAt: future,
            endsAt: new Date(future.getTime() + 60_000),
            status: 'ACTIVE',
          },
          {
            machineId: machine.id,
            userId: resident.id,
            startsAt: later,
            endsAt: new Date(later.getTime() + 60_000),
            status: 'AFFECTED',
          },
        ],
      });

      const response = await bea.post('/api/houses/haus/leave');

      expect(response.status).toBe(204);
      expect(response.text).toBe('');

      const remaining = await prisma.booking.findMany({ where: { userId: resident.id } });

      expect(remaining).toHaveLength(1);
      expect(remaining[0].startsAt).toEqual(past);
      expect(remaining[0].status).toBe('ACTIVE');

      const me = await bea.get('/api/auth/me');

      expect(me.body.houseSlug).toBeNull();
      expect(me.body.role).toBeNull();

      const admins = await prisma.membership.findMany();

      expect(admins).toHaveLength(1);
      expect(admins[0].role).toBe('ADMIN');

      const again = await bea.post('/api/houses/haus/leave');

      expect(again.status).toBe(404);
      expect(again.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found.' },
      });
    });

    it('keeps the membership and future booking when the last admin leaves', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const house = await createNamedHouse(ada, 'Haus');
      const user = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const machine = await prisma.machine.create({
        data: { houseId: house.id, name: 'Waschmaschine 1', type: 'WASHER' },
      });
      const startsAt = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.booking.create({
        data: {
          machineId: machine.id,
          userId: user.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60_000),
        },
      });

      const response = await ada.post('/api/houses/haus/leave');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: 'LAST_ADMIN',
          message: 'A house must keep at least one admin.',
        },
      });
      expect(await prisma.membership.count()).toBe(1);
      expect(await prisma.booking.count()).toBe(1);
    });

    it('lets one admin leave when another admin remains', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const registered = await request(app).post('/api/auth/register').send({
        email: 'bea@example.com',
        name: 'Bea',
        password: PASSWORD,
      });

      expect(registered.status).toBe(201);

      const house = await createNamedHouse(ada, 'Haus');
      const beaUser = await prisma.user.findUnique({ where: { email: 'bea@example.com' } });

      await prisma.membership.create({
        data: { userId: beaUser.id, houseId: house.id, role: 'ADMIN' },
      });

      const response = await ada.post('/api/houses/haus/leave');
      const remaining = await prisma.membership.findMany();

      expect(response.status).toBe(204);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatchObject({ userId: beaUser.id, role: 'ADMIN' });
    });

    it('rejects leave from an admin of another house', async () => {
      const ada = await registerAndLogin('ada@example.com', 'Ada');
      const bea = await registerAndLogin('bea@example.com', 'Bea');

      await createNamedHouse(ada, 'Haus');
      await createNamedHouse(bea, 'Other');

      const response = await bea.post('/api/houses/haus/leave');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found.' },
      });
      expect(await prisma.membership.count()).toBe(2);
    });
  });
});
