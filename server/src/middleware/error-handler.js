import { ZodError } from 'zod';
import { AppError, isAppError } from '../lib/errors.js';

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isAppError(error)) {
    sendError(res, error);
    return;
  }

  if (isInvalidJson(error)) {
    sendError(res, new AppError('VALIDATION_ERROR', 'Invalid JSON.'));
    return;
  }

  if (error instanceof ZodError) {
    sendError(res, new AppError('VALIDATION_ERROR', formatZodError(error)));
    return;
  }

  console.error(error);
  sendError(res, new AppError('INTERNAL_ERROR'));
}

function sendError(res, error) {
  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
    },
  });
}

function isInvalidJson(error) {
  return (
    error instanceof SyntaxError && error.status === 400 && error.type === 'entity.parse.failed'
  );
}

function formatZodError(error) {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join(', ');
}
