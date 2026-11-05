import { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { validate } from '../../src/middleware/validate.js';

function testApp() {
  return createApp({
    configure(app) {
      app.post(
        '/_test/echo',
        validate({
          body: z.object({
            name: z.string().min(1),
          }),
          query: z.object({
            start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          }),
        }),
        (req, res) => {
          res.json({ name: req.body.name, start: req.query.start });
        },
      );

      app.get(
        '/_test/items/:id',
        validate({
          params: z.object({
            id: z.string().regex(/^[0-9]+$/),
          }),
        }),
        (req, res) => {
          res.json({ id: req.params.id });
        },
      );

      app.get('/_test/prisma/:code', (req, res, next) => {
        next(
          new Prisma.PrismaClientKnownRequestError('failed', {
            code: req.params.code,
            clientVersion: 'test',
            meta: { target: ['email'] },
          }),
        );
      });

      app.get('/_test/boom', (req, res, next) => {
        next(new Error('database password=secret'));
      });
    },
  });
}

describe('error responses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when the body is invalid', async () => {
    const response = await request(testApp())
      .post('/_test/echo?start=2026-11-02')
      .send({ name: '' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('body.name:');
  });

  it('returns 400 when the query is invalid', async () => {
    const response = await request(testApp())
      .post('/_test/echo?start=monday')
      .send({ name: 'Ada' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('query.start:');
  });

  it('returns 400 when the param is invalid', async () => {
    const response = await request(testApp()).get('/_test/items/nope');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('params.id:');
  });

  it('returns the parsed fields and drops unknown keys', async () => {
    const response = await request(testApp())
      .post('/_test/echo?start=2026-11-02&extra=1')
      .send({ name: 'Ada', extra: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'Ada', start: '2026-11-02' });
  });

  it('returns 400 for invalid JSON without the parser text', async () => {
    const response = await request(createApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON.' },
    });
    expect(response.text).not.toContain('Expected property name');
  });

  it('returns 404 JSON for an unknown route', async () => {
    const response = await request(createApp()).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  it('returns the same 404 JSON for favicon.ico', async () => {
    const response = await request(createApp()).get('/favicon.ico');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  it('returns 409 for a duplicate value and hides the field name', async () => {
    const response = await request(testApp()).get('/_test/prisma/P2002');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'CONFLICT', message: 'This conflicts with existing data.' },
    });
    expect(response.text).not.toContain('email');
  });

  it('returns 404 when Prisma cannot find the row', async () => {
    const response = await request(testApp()).get('/_test/prisma/P2025');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  it('returns 500 for any other Prisma error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(testApp()).get('/_test/prisma/P2003');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    });
  });

  it('hides an unexpected error and logs it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(testApp()).get('/_test/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    });
    expect(response.text).not.toContain('database password=secret');
    expect(response.text).not.toContain('stack');
    expect(spy).toHaveBeenCalled();
  });

  it('does not log a 404', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await request(createApp()).get('/api/does-not-exist');

    expect(spy).not.toHaveBeenCalled();
  });
});
