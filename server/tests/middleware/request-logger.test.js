import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import {
  createRequestLogger,
  serializeRequest,
  serializeResponse,
} from '../../src/middleware/request-logger.js';

describe('request logger', () => {
  it('keeps the health check response', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('omits the cookie, set-cookie, body, password, and password hash from the log', async () => {
    const lines = [];
    const stream = {
      write(chunk) {
        lines.push(typeof chunk === 'string' ? chunk : chunk.toString());
      },
    };
    const app = express();

    app.use(createRequestLogger('development', stream));
    app.use(express.json());
    app.post('/login', (req, res) => {
      res.setHeader('Set-Cookie', 'session=response-cookie-secret; HttpOnly');
      res.status(201).json({ ok: true });
    });

    const response = await request(app)
      .post('/login?page=1')
      .set('Cookie', 'session=request-cookie-secret')
      .send({ password: 'body-password-secret', passwordHash: 'body-hash-secret' });

    expect(response.status).toBe(201);

    const logged = lines.join('');

    expect(logged).toContain('"method":"POST"');
    expect(logged).toContain('"statusCode":201');
    expect(logged).toContain('"host"');
    expect(logged).not.toContain('request-cookie-secret');
    expect(logged).not.toContain('response-cookie-secret');
    expect(logged).not.toContain('body-password-secret');
    expect(logged).not.toContain('body-hash-secret');
  });

  it('keeps the normal request fields and leaves secrets out', () => {
    const serialized = serializeRequest({
      id: 7,
      method: 'POST',
      originalUrl: '/login?page=1',
      query: { page: '1', password: 'query-password-secret' },
      params: { passwordHash: 'param-hash-secret' },
      headers: {
        host: 'localhost',
        cookie: 'session=request-cookie-secret',
      },
      socket: { remoteAddress: '127.0.0.1', remotePort: 4321 },
      body: { password: 'body-password-secret', passwordHash: 'body-hash-secret' },
      password: 'top-level-password-secret',
      passwordHash: 'top-level-hash-secret',
    });

    expect(serialized).toEqual({
      id: 7,
      method: 'POST',
      url: '/login?page=1',
      headers: { host: 'localhost' },
      remoteAddress: '127.0.0.1',
      remotePort: 4321,
      query: { page: '1' },
      params: {},
    });
  });

  it('omits set-cookie and keeps the status code', () => {
    expect(
      serializeResponse({
        headersSent: true,
        statusCode: 201,
        getHeaders() {
          return {
            'content-type': 'application/json',
            'set-cookie': ['session=response-cookie-secret'],
          };
        },
      }),
    ).toEqual({
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
    });
  });
});
