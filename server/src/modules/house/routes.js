import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { createHouseBodySchema, joinHouseBodySchema } from './schemas.js';
import { createHouse, joinHouse } from './service.js';

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

  return router;
}
