import express from 'express';
import { env } from '../../config/env.js';
import { createLoginRateLimit } from '../../middleware/login-rate-limit.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../../lib/session.js';
import { loginBodySchema, registerBodySchema } from './schemas.js';
import { loginUser, logoutSession, registerUser } from './service.js';

export function createAuthRouter({ loginRateLimit = createLoginRateLimit() } = {}) {
  const router = express.Router();

  router.post('/register', validate({ body: registerBodySchema }), async (req, res) => {
    const user = await registerUser(req.body);
    res.status(201).json(user);
  });

  router.post('/login', loginRateLimit, validate({ body: loginBodySchema }), async (req, res) => {
    const { user, token } = await loginUser(req.body);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(env.NODE_ENV));
    res.status(200).json(user);
  });

  router.post('/logout', async (req, res) => {
    await logoutSession(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(env.NODE_ENV));
    res.status(204).send();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.status(200).json(req.user);
  });

  return router;
}
