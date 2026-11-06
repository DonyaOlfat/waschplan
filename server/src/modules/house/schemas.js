import { z } from 'zod';

export const createHouseBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
