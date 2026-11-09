import { z } from 'zod';
import { houseSlugParamsSchema } from '../house/schemas.js';

export { houseSlugParamsSchema };

export const createBookingBodySchema = z.strictObject({
  machineId: z.string().trim().min(1).max(64),
  startsAt: z.iso.datetime({ offset: true }),
});

export const weekParamsSchema = houseSlugParamsSchema.extend({
  id: z.string().trim().min(1).max(64),
});

export const weekQuerySchema = z.strictObject({
  start: z.iso.date(),
});
