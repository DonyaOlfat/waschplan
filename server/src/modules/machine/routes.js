import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireAdmin, requireMember } from '../../middleware/require-member.js';
import { validate } from '../../middleware/validate.js';
import {
  createMachineBodySchema,
  houseSlugParamsSchema,
  machineIdParamsSchema,
  renameMachineBodySchema,
} from './schemas.js';
import { createMachine, deleteMachine, listMachines, renameMachine } from './service.js';

export function createMachineRouter() {
  const router = express.Router();

  router.get(
    '/:slug/machines',
    requireAuth,
    validate({ params: houseSlugParamsSchema }),
    requireMember,
    async (req, res) => {
      const machines = await listMachines(req.house.id);
      res.status(200).json(machines);
    },
  );

  router.post(
    '/:slug/machines',
    requireAuth,
    validate({ params: houseSlugParamsSchema }),
    requireMember,
    requireAdmin,
    validate({ body: createMachineBodySchema }),
    async (req, res) => {
      const machine = await createMachine({
        houseId: req.house.id,
        name: req.body.name,
        type: req.body.type,
      });
      res.status(201).json(machine);
    },
  );

  router.patch(
    '/:slug/machines/:id',
    requireAuth,
    validate({ params: houseSlugParamsSchema.passthrough() }),
    requireMember,
    requireAdmin,
    validate({ params: machineIdParamsSchema, body: renameMachineBodySchema }),
    async (req, res) => {
      const machine = await renameMachine({
        houseId: req.house.id,
        machineId: req.params.id,
        name: req.body.name,
      });
      res.status(200).json(machine);
    },
  );

  router.delete(
    '/:slug/machines/:id',
    requireAuth,
    validate({ params: houseSlugParamsSchema.passthrough() }),
    requireMember,
    requireAdmin,
    validate({ params: machineIdParamsSchema }),
    async (req, res) => {
      await deleteMachine({
        houseId: req.house.id,
        machineId: req.params.id,
      });
      res.status(204).send();
    },
  );

  return router;
}
