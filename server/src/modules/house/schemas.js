import { z } from 'zod';
import { INVITE_ALPHABET } from './invite-code.js';

const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${INVITE_ALPHABET}]{6}$`));

export const createHouseBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const joinHouseBodySchema = z.object({
  inviteCode: inviteCodeSchema,
});
