import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const registerBodySchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(72),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});
