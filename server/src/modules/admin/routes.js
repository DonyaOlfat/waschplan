import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireAdmin, requireMember } from '../../middleware/require-member.js';
import { validate } from '../../middleware/validate.js';
import { houseSlugParamsSchema } from './schemas.js';
import { listMembers, regenerateInviteCode } from './service.js';

export function createAdminRouter() {
  const router = express.Router();

  router.get(
    '/:slug/members',
    requireAuth,
    validate({ params: houseSlugParamsSchema.passthrough() }),
    requireMember,
    requireAdmin,
    async (req, res) => {
      const members = await listMembers(req.house.id);
      res.status(200).json(members);
    },
  );

  router.post(
    '/:slug/invite-code',
    requireAuth,
    validate({ params: houseSlugParamsSchema.passthrough() }),
    requireMember,
    requireAdmin,
    async (req, res) => {
      const house = await regenerateInviteCode({ houseId: req.house.id });
      res.status(200).json(house);
    },
  );

  return router;
}
