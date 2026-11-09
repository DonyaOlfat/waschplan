import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireAdmin, requireMember } from '../../middleware/require-member.js';
import { validate } from '../../middleware/validate.js';
import {
  houseSlugParamsSchema,
  memberUserIdParamsSchema,
  updateMemberRoleBodySchema,
} from './schemas.js';
import { listMembers, regenerateInviteCode, updateMemberRole } from './service.js';

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

  router.patch(
    '/:slug/members/:userId',
    requireAuth,
    validate({ params: houseSlugParamsSchema.passthrough() }),
    requireMember,
    requireAdmin,
    validate({ params: memberUserIdParamsSchema, body: updateMemberRoleBodySchema }),
    async (req, res) => {
      const member = await updateMemberRole({
        houseId: req.house.id,
        userId: req.params.userId,
        role: req.body.role,
      });
      res.status(200).json(member);
    },
  );

  return router;
}
