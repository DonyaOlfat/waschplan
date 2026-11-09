import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  generateWeekSlots,
  isSlotInPast,
  validateBookingWindow,
  validateSlotStart,
} from '../slots/slots.js';
import { parseBerlinDate, startOfBerlinWeek, toBerlinDateTime } from '../slots/time.js';

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
    const locked = await tx.$queryRaw`
      SELECT id FROM "Membership"
      WHERE "userId" = ${userId} AND "houseId" = ${houseId}
      FOR UPDATE
    `;

    if (locked.length === 0) {
      throw new AppError('NOT_FOUND');
    }

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

    const upcomingCount = await tx.booking.count({
      where: {
        userId,
        status: 'ACTIVE',
        startsAt: { gt: now },
        machine: { houseId },
      },
    });

    if (upcomingCount >= 2) {
      throw new AppError('BOOKING_LIMIT');
    }

    const startMs = new Date(startsAt).getTime();
    const slot = generateWeekSlots(startsAt).find(
      (candidate) => candidate.startsAt.getTime() === startMs,
    );

    if (!slot) {
      throw new Error('Validated slot is missing from the generated week.');
    }

    try {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('SLOT_TAKEN');
      }

      throw error;
    }
  });
}

export async function getMachineWeek({ houseId, machineId, start, userId, now }) {
  const machine = await prisma.machine.findFirst({
    where: { id: machineId, houseId },
  });

  if (!machine) {
    throw new AppError('NOT_FOUND');
  }

  const startDate = parseBerlinDate(start);
  const slots = generateWeekSlots(startDate);
  const bookings = await prisma.booking.findMany({
    where: {
      machineId: machine.id,
      startsAt: { in: slots.map((slot) => slot.startsAt) },
    },
    select: {
      userId: true,
      startsAt: true,
      status: true,
      user: { select: { name: true } },
    },
  });
  const bookingsByStart = new Map(bookings.map((booking) => [booking.startsAt.getTime(), booking]));

  return {
    machineId: machine.id,
    weekStart: toBerlinDateTime(startOfBerlinWeek(startDate)).toISODate(),
    slots: slots.map((slot) =>
      toWeekSlot(slot, bookingsByStart.get(slot.startsAt.getTime()), {
        userId,
        now,
        isBroken: machine.isBroken,
      }),
    ),
  };
}

function toWeekSlot(slot, booking, { userId, now, isBroken }) {
  const view = {
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status: weekSlotStatus(slot, booking, { userId, now, isBroken }),
  };

  if (!booking) {
    return view;
  }

  return {
    ...view,
    bookedBy: firstName(booking.user.name),
    mine: booking.userId === userId,
  };
}

function weekSlotStatus(slot, booking, { userId, now, isBroken }) {
  if (isSlotInPast(slot.startsAt, now)) {
    return 'past';
  }

  if (booking?.status === 'AFFECTED') {
    return 'affected';
  }

  if (booking?.status === 'ACTIVE' && booking.userId === userId) {
    return 'mine';
  }

  if (booking?.status === 'ACTIVE') {
    return 'booked';
  }

  if (isBroken && !booking) {
    return 'broken';
  }

  return 'free';
}

function firstName(name) {
  return name.trim().split(/\s+/)[0];
}
