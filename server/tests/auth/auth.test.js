import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed.js';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { hashSessionToken } from '../../src/lib/session.js';
import { verifyPassword } from '../../src/lib/password.js';
import { createLoginRateLimit } from '../../src/middleware/login-rate-limit.js';
import { resetDatabase } from '../helpers/reset-database.js';

const PASSWORD = 'correct-horse';

const app = createApp({
  auth: {
    loginRateLimit: createLoginRateLimit({ limit: 1000 }),
  },
});

function sessionCookie(response) {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : [];

  return cookies.find((cookie) => cookie.startsWith('session=')) ?? null;
}

function sessionToken(response) {
  const cookie = sessionCookie(response);

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.slice('session='.length).split(';')[0]);
}

function register(email = 'Ada@Example.com') {
  return request(app).post('/api/auth/register').send({
    email,
    name: '  Ada  ',
    password: PASSWORD,
    passwordHash: 'plaintext-hash',
  });
}

describe('auth', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('creates a user, stores a bcrypt hash, and sets no session', async () => {
      const response = await register();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(String),
        email: 'ada@example.com',
        name: 'Ada',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        houseSlug: null,
        role: null,
      });
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await prisma.session.count()).toBe(0);

      const user = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });

      expect(user.passwordHash).toMatch(/^\$2[ab]\$/);
      expect(user.passwordHash).not.toBe('plaintext-hash');
      expect(user.passwordHash).not.toBe(PASSWORD);
      expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);
    });

    it('returns 409 when the email is already registered in any case', async () => {
      await register();

      const response = await register('ADA@example.com');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: 'EMAIL_TAKEN',
          message: 'An account with this email already exists.',
        },
      });
    });

    it('returns 400 for a bad email, a blank name, or a short password', async () => {
      const badEmail = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', name: 'Ada', password: PASSWORD });
      const blankName = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', name: '   ', password: PASSWORD });
      const shortPassword = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ada@example.com', name: 'Ada', password: 'short' });

      expect(badEmail.status).toBe(400);
      expect(badEmail.body.error.code).toBe('VALIDATION_ERROR');
      expect(blankName.status).toBe(400);
      expect(blankName.body.error.code).toBe('VALIDATION_ERROR');
      expect(shortPassword.status).toBe(400);
      expect(shortPassword.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    it('sets a session cookie whose hash is the session id', async () => {
      await register();

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: PASSWORD });
      const token = sessionToken(response);
      const cookie = sessionCookie(response);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        email: 'ada@example.com',
        name: 'Ada',
        houseSlug: null,
        role: null,
      });
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Max-Age=2592000');
      expect(cookie).not.toContain('Secure');
      expect(cookie).not.toContain(PASSWORD);

      const sessions = await prisma.session.findMany();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(hashSessionToken(token));
      expect(sessions[0].id).not.toBe(token);
    });

    it('creates one session row per login', async () => {
      await register();

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: PASSWORD });
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: PASSWORD });

      expect(await prisma.session.count()).toBe(2);
    });

    it('returns the same error for an unknown email and a wrong password', async () => {
      await register();

      const unknown = await request(app)
        .post('/api/auth/login')
        .send({ email: 'missing@example.com', password: PASSWORD });
      const wrong = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: 'wrong-password' });
      const short = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: 'nope' });

      expect(unknown.status).toBe(401);
      expect(unknown.body).toEqual(wrong.body);
      expect(unknown.body).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect.',
        },
      });
      expect(unknown.text).not.toContain('passwordHash');
      expect(wrong.text).not.toContain('passwordHash');
      expect(short.status).toBe(401);
      expect(short.body).toEqual(unknown.body);
    });

    it('returns 400 for an invalid login body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('logs in the seeded demo user', async () => {
      await seed();

      const response = await request(app).post('/api/auth/login').send({
        email: 'lena@wittensteinstr.example',
        password: 'waschplan',
      });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Lena');
      expect(response.body.houseSlug).toBeNull();
      expect(response.body.role).toBeNull();
      expect(response.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('deletes the session, clears the cookie, and blocks /me', async () => {
      await register();
      const agent = request.agent(app);

      await agent.post('/api/auth/login').send({ email: 'ada@example.com', password: PASSWORD });

      const response = await agent.post('/api/auth/logout');
      const me = await agent.get('/api/auth/me');

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(sessionCookie(response)).toContain('Expires=Thu, 01 Jan 1970');
      expect(await prisma.session.count()).toBe(0);
      expect(me.status).toBe(401);
      expect(me.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 204 when there is no cookie', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
    });

    it('leaves a second login valid', async () => {
      await register();
      const first = request.agent(app);
      const second = request.agent(app);
      const body = { email: 'ada@example.com', password: PASSWORD };

      await first.post('/api/auth/login').send(body);
      await second.post('/api/auth/login').send(body);
      await first.post('/api/auth/logout');

      expect(await prisma.session.count()).toBe(1);
      expect((await first.get('/api/auth/me')).status).toBe(401);
      expect((await second.get('/api/auth/me')).status).toBe(200);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 when the cookie is missing or unknown', async () => {
      const missing = await request(app).get('/api/auth/me');
      const unknown = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'session=not-a-real-token');

      expect(missing.status).toBe(401);
      expect(missing.body).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'You need to log in.' },
      });
      expect(unknown.body).toEqual(missing.body);
    });

    it('returns the public user and null house fields', async () => {
      await register();
      const agent = request.agent(app);

      await agent.post('/api/auth/login').send({ email: 'ada@example.com', password: PASSWORD });

      const response = await agent.get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        email: 'ada@example.com',
        name: 'Ada',
        houseSlug: null,
        role: null,
      });
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('keeps house slug and role null when a membership exists', async () => {
      await register();
      const agent = request.agent(app);

      await agent.post('/api/auth/login').send({ email: 'ada@example.com', password: PASSWORD });

      const user = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
      const house = await prisma.house.create({
        data: { name: 'House', slug: 'house', inviteCode: 'CODE01' },
      });

      await prisma.membership.create({
        data: { userId: user.id, houseId: house.id, role: 'ADMIN' },
      });

      const response = await agent.get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body.houseSlug).toBeNull();
      expect(response.body.role).toBeNull();
    });

    it('returns 401 for an expired session and deletes the row', async () => {
      await register();
      const agent = request.agent(app);

      await agent.post('/api/auth/login').send({ email: 'ada@example.com', password: PASSWORD });
      await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      const response = await agent.get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
      expect(await prisma.session.count()).toBe(0);
    });
  });

  describe('login rate limit', () => {
    it('limits login and not register', async () => {
      const limited = createApp({
        auth: {
          loginRateLimit: createLoginRateLimit({ limit: 2, windowMs: 60_000 }),
        },
      });
      const body = { email: 'ada@example.com', password: 'wrong-password' };

      expect((await request(limited).post('/api/auth/login').send(body)).status).toBe(401);
      expect((await request(limited).post('/api/auth/login').send(body)).status).toBe(401);

      const blocked = await request(limited).post('/api/auth/login').send(body);

      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many login attempts. Try again later.',
        },
      });

      for (const email of ['one@example.com', 'two@example.com', 'three@example.com']) {
        const response = await request(limited)
          .post('/api/auth/register')
          .send({ email, name: 'Ada', password: PASSWORD });

        expect(response.status).toBe(201);
      }
    });
  });
});
