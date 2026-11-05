import { AppError } from '../lib/errors.js';

export function notFoundHandler(req, res, next) {
  next(new AppError('NOT_FOUND'));
}
