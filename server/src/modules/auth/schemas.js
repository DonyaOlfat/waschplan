import { z } from 'zod';

export const registerBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(72),
});
