import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireMember } from '../../middleware/require-member.js';
import { validate } from '../../middleware/validate.js';
import {
  createBookingBodySchema,
  houseSlugParamsSchema,
  weekParamsSchema,
  weekQuerySchema,
} from './schemas.js';
import { createBooking, getMachineWeek } from './service.js';

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

  router.get(
    '/:slug/machines/:id/week',
    requireAuth,
    validate({ params: houseSlugParamsSchema.passthrough() }),
    requireMember,
    validate({ params: weekParamsSchema, query: weekQuerySchema }),
    async (req, res) => {
      const week = await getMachineWeek({
        houseId: req.house.id,
        machineId: req.params.id,
        start: req.query.start,
        userId: req.user.id,
        now: new Date(),
      });

      res.status(200).json(week);
    },
  );

  return router;
}
