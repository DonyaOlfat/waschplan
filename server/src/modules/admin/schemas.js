import { z } from 'zod';
import { houseSlugParamsSchema } from '../house/schemas.js';

export { houseSlugParamsSchema };

export const memberUserIdParamsSchema = houseSlugParamsSchema.extend({
  userId: z.string().trim().min(1).max(64),
});

export const updateMemberRoleBodySchema = z.strictObject({
  role: z.enum(['ADMIN', 'RESIDENT']),
});
