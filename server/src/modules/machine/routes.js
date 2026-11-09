import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireMember } from '../../middleware/require-member.js';
import { validate } from '../../middleware/validate.js';
import { houseSlugParamsSchema } from './schemas.js';
import { listMachines } from './service.js';

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

  return router;
}
