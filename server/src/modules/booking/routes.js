import express from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireMember } from '../../middleware/require-member.js';
import { validate } from '../../middleware/validate.js';
import {
  bookingIdParamsSchema,
  createBookingBodySchema,
  houseSlugParamsSchema,
  weekParamsSchema,
  weekQuerySchema,
} from './schemas.js';
import { cancelBooking, createBooking, getMachineWeek, listMyBookings } from './service.js';

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
    '/:slug/bookings/me',
    requireAuth,
    validate({ params: houseSlugParamsSchema }),
    requireMember,
    async (req, res) => {
      const bookings = await listMyBookings({
        userId: req.user.id,
        houseId: req.house.id,
        now: new Date(),
      });

      res.status(200).json(bookings);
    },
  );

  router.delete(
    '/:slug/bookings/:id',
    requireAuth,
    validate({ params: houseSlugParamsSchema.passthrough() }),
    requireMember,
    validate({ params: bookingIdParamsSchema }),
    async (req, res) => {
      await cancelBooking({
        userId: req.user.id,
        houseId: req.house.id,
        bookingId: req.params.id,
        isAdmin: false,
        now: new Date(),
      });

      res.status(204).send();
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
