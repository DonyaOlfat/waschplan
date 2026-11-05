import rateLimit from 'express-rate-limit';
import { AppError } from '../lib/errors.js';

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX = 10;

export function createLoginRateLimit({
  windowMs = LOGIN_RATE_LIMIT_WINDOW_MS,
  limit = LOGIN_RATE_LIMIT_MAX,
} = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res, next) {
      next(new AppError('TOO_MANY_REQUESTS'));
    },
  });
}
