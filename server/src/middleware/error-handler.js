import { ZodError } from 'zod';
import { AppError, isAppError } from '../lib/errors.js';
import { Prisma } from '@prisma/client';

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

  const mapped = prismaError(error);

  if (mapped) {
    sendError(res, mapped);
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

function prismaError(error) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  if (error.code === 'P2002') {
    return new AppError('CONFLICT');
  }

  if (error.code === 'P2025') {
    return new AppError('NOT_FOUND');
  }

  return null;
}

function formatZodError(error) {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join(', ');
}
