import cookieParser from 'cookie-parser';
import express from 'express';
import { healthRouter } from './modules/health/routes.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';

export function createApp({ configure } = {}) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/health', healthRouter);
  app.use('/api/auth', createAuthRouter());

  if (configure) {
    configure(app);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
