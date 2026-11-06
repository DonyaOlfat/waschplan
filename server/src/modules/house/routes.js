import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireMember } from '../../middleware/require-member.js';
import { validate } from '../../middleware/validate.js';
import { createHouseBodySchema, houseSlugParamsSchema, joinHouseBodySchema } from './schemas.js';
import { createHouse, joinHouse, leaveHouse, toPublicHouse } from './service.js';

export function createHouseRouter() {
  const router = express.Router();

  router.post('/join', requireAuth, validate({ body: joinHouseBodySchema }), async (req, res) => {
    const house = await joinHouse({ userId: req.user.id, inviteCode: req.body.inviteCode });
    res.status(201).json(house);
  });

  router.post('/', requireAuth, validate({ body: createHouseBodySchema }), async (req, res) => {
    const house = await createHouse({ userId: req.user.id, name: req.body.name });
    res.status(201).json(house);
  });

  router.get(
    '/:slug',
    requireAuth,
    validate({ params: houseSlugParamsSchema }),
    requireMember,
    (req, res) => {
      res.status(200).json(toPublicHouse(req.house, req.membership.role));
    },
  );

  router.post(
    '/:slug/leave',
    requireAuth,
    validate({ params: houseSlugParamsSchema }),
    requireMember,
    async (req, res) => {
      await leaveHouse({ userId: req.user.id, houseId: req.house.id });
      res.status(204).send();
    },
  );

  return router;
}
