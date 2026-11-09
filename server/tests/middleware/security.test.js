import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const allowedOrigin = 'http://localhost:5173';

describe('security headers', () => {
  it('reflects an allowed origin and allows credentials', async () => {
    const response = await request(createApp()).get('/api/health').set('Origin', allowedOrigin);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('answers a preflight from an allowed origin', async () => {
    const response = await request(createApp())
      .options('/api/health')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('continues without an allow-origin header for an origin that is not listed', async () => {
    const response = await request(createApp())
      .get('/api/health')
      .set('Origin', 'https://evil.example');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('returns the health body when no origin is sent', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('sets x-content-type-options to nosniff', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
