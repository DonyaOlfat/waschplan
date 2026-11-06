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
