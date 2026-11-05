import { AppError } from '../lib/errors.js';
import { SESSION_COOKIE } from '../lib/session.js';
import { getUserBySessionToken } from '../modules/auth/service.js';

export async function requireAuth(req, res, next) {
  try {
    const user = await getUserBySessionToken(req.cookies?.[SESSION_COOKIE]);

    if (!user) {
      next(new AppError('UNAUTHENTICATED'));
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
