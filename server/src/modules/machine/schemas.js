import { z } from 'zod';
import { houseSlugParamsSchema } from '../house/schemas.js';

export { houseSlugParamsSchema };

const machineNameSchema = z.string().trim().min(1).max(80);

export const createMachineBodySchema = z.strictObject({
  name: machineNameSchema,
  type: z.enum(['WASHER', 'DRYER']),
});

export const renameMachineBodySchema = z.strictObject({
  name: machineNameSchema,
});

export const setMachineBrokenBodySchema = z.strictObject({
  isBroken: z.boolean(),
});

export const patchMachineBodySchema = z.union([
  renameMachineBodySchema,
  setMachineBrokenBodySchema,
]);

export const machineIdParamsSchema = houseSlugParamsSchema.extend({
  id: z.string().trim().min(1).max(64),
});
