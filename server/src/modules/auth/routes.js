import express from 'express';
import { validate } from '../../middleware/validate.js';
import { registerBodySchema } from './schemas.js';
import { registerUser } from './service.js';

export function createAuthRouter() {
  const router = express.Router();

  router.post('/register', validate({ body: registerBodySchema }), async (req, res) => {
    const user = await registerUser(req.body);
    res.status(201).json(user);
  });

  return router;
}
