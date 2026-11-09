import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireMember } from '../../middleware/require-member.js';
import { validate } from '../../middleware/validate.js';
import { createBookingBodySchema, houseSlugParamsSchema } from './schemas.js';
import { createBooking } from './service.js';

export function createBookingRouter() {
  const router = express.Router();

  router.post(
    '/:slug/bookings',
    requireAuth,
    validate({ params: houseSlugParamsSchema }),
    requireMember,
    validate({ body: createBookingBodySchema }),
    async (req, res) => {
      const booking = await createBooking({
        userId: req.user.id,
        houseId: req.house.id,
        machineId: req.body.machineId,
        startsAt: req.body.startsAt,
        now: new Date(),
      });

      res.status(201).json(booking);
    },
  );

  return router;
}
