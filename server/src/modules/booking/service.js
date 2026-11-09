import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  generateWeekSlots,
  isSlotInPast,
  validateBookingWindow,
  validateSlotStart,
} from '../slots/slots.js';

export function toPublicBooking(booking) {
  return {
    id: booking.id,
    machineId: booking.machineId,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    createdAt: booking.createdAt,
  };
}

export async function createBooking({ userId, houseId, machineId, startsAt, now }) {
  return prisma.$transaction(async (tx) => {
    const machine = await tx.machine.findFirst({
      where: { id: machineId, houseId },
    });

    if (!machine) {
      throw new AppError('NOT_FOUND');
    }

    if (!validateSlotStart(startsAt).ok) {
      throw new AppError('OUTSIDE_OPENING_HOURS');
    }

    if (!validateBookingWindow(startsAt, now).ok) {
      throw new AppError('OUTSIDE_BOOKING_WINDOW');
    }

    if (isSlotInPast(startsAt, now)) {
      throw new AppError('SLOT_IN_PAST');
    }

    if (machine.isBroken) {
      throw new AppError('MACHINE_BROKEN');
    }

    const startMs = new Date(startsAt).getTime();
    const slot = generateWeekSlots(startsAt).find(
      (candidate) => candidate.startsAt.getTime() === startMs,
    );

    if (!slot) {
      throw new Error('Validated slot is missing from the generated week.');
    }

    const booking = await tx.booking.create({
      data: {
        machineId: machine.id,
        userId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: 'ACTIVE',
      },
    });

    return toPublicBooking(booking);
  });
}
