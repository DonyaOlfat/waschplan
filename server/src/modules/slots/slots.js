import { startOfBerlinWeek, toBerlinDateTime } from './time.js';

export const OPENING_HOUR = 6;
export const CLOSING_HOUR = 22;
export const SLOT_LENGTH_HOURS = 2;
export const OPEN_WEEKDAYS = [1, 2, 3, 4, 5, 6];
export const SLOTS_PER_DAY = 8;
export const SLOTS_PER_WEEK = 48;
export const BOOKING_WINDOW_WEEKS = 4;

export function generateWeekSlots(instant) {
  const weekStart = toBerlinDateTime(startOfBerlinWeek(instant));
  const slots = [];

  for (const weekday of OPEN_WEEKDAYS) {
    const day = weekStart.plus({ days: weekday - 1 });

    for (let hour = OPENING_HOUR; hour < CLOSING_HOUR; hour += SLOT_LENGTH_HOURS) {
      const startsAt = day.set({ hour, minute: 0, second: 0, millisecond: 0 });
      const endsAt = startsAt.plus({ hours: SLOT_LENGTH_HOURS });

      slots.push({
        startsAt: startsAt.toJSDate(),
        endsAt: endsAt.toJSDate(),
      });
    }
  }

  return slots;
}

export function validateSlotStart(instant) {
  const berlin = toBerlinDateTime(instant);
  const onOpeningHour =
    berlin.hour >= OPENING_HOUR &&
    berlin.hour < CLOSING_HOUR &&
    (berlin.hour - OPENING_HOUR) % SLOT_LENGTH_HOURS === 0;
  const onTheHour = berlin.minute === 0 && berlin.second === 0 && berlin.millisecond === 0;

  if (!OPEN_WEEKDAYS.includes(berlin.weekday) || !onOpeningHour || !onTheHour) {
    return { ok: false, reason: 'OUTSIDE_OPENING_HOURS' };
  }

  return { ok: true };
}

export function validateBookingWindow(instant, now) {
  const start = toBerlinDateTime(startOfBerlinWeek(now));
  const end = start.plus({ weeks: BOOKING_WINDOW_WEEKS });
  const startsAt = toBerlinDateTime(instant).toMillis();

  if (startsAt < start.toMillis() || startsAt >= end.toMillis()) {
    return { ok: false, reason: 'OUTSIDE_BOOKING_WINDOW' };
  }

  return { ok: true };
}

export function isSlotInPast(startsAt, now) {
  return toBerlinDateTime(startsAt).toMillis() <= toBerlinDateTime(now).toMillis();
}
