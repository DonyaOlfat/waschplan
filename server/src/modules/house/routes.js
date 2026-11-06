import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { createHouseBodySchema } from './schemas.js';
import { createHouse } from './service.js';

export function createHouseRouter() {
  const router = express.Router();

  router.post('/', requireAuth, validate({ body: createHouseBodySchema }), async (req, res) => {
    const house = await createHouse({ userId: req.user.id, name: req.body.name });
    res.status(201).json(house);
  });

  return router;
}
