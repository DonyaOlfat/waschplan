import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  generateWeekSlots,
  isSlotInPast,
  validateBookingWindow,
  validateSlotStart,
} from '../../src/modules/slots/slots.js';
import { BERLIN_ZONE, startOfBerlinWeek } from '../../src/modules/slots/time.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const OPENING_HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
const outsideOpeningHours = { ok: false, reason: 'OUTSIDE_OPENING_HOURS' };
const outsideBookingWindow = { ok: false, reason: 'OUTSIDE_BOOKING_WINDOW' };

function slotInstants(slots) {
  return slots.map((slot) => [slot.startsAt.toISOString(), slot.endsAt.toISOString()]);
}

function expectOpeningWeek(slots) {
  expect(slots).toHaveLength(48);

  const perDay = new Map();

  for (const slot of slots) {
    const start = DateTime.fromJSDate(slot.startsAt, { zone: BERLIN_ZONE });
    const day = start.toISODate();

    expect(start.weekday).not.toBe(7);
    expect(OPENING_HOURS).toContain(start.hour);
    expect(start.minute).toBe(0);
    expect(start.second).toBe(0);
    expect(start.millisecond).toBe(0);
    expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(TWO_HOURS_MS);

    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  expect(perDay.size).toBe(6);

  for (const count of perDay.values()) {
    expect(count).toBe(8);
  }
}

describe('startOfBerlinWeek', () => {
  it('returns Monday 23 March for both sides of the spring-forward', () => {
    expect(startOfBerlinWeek('2026-03-29T00:30:00.000Z').toISOString()).toBe(
      '2026-03-22T23:00:00.000Z',
    );
    expect(startOfBerlinWeek('2026-03-29T01:30:00.000Z').toISOString()).toBe(
      '2026-03-22T23:00:00.000Z',
    );
  });

  it('returns Monday 30 March midnight itself', () => {
    expect(startOfBerlinWeek('2026-03-29T22:00:00.000Z').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
  });

  it('returns Monday 19 October for both 02:30 occurrences', () => {
    expect(startOfBerlinWeek('2026-10-25T00:30:00.000Z').toISOString()).toBe(
      '2026-10-18T22:00:00.000Z',
    );
    expect(startOfBerlinWeek('2026-10-25T01:30:00.000Z').toISOString()).toBe(
      '2026-10-18T22:00:00.000Z',
    );
  });

  it('returns Monday 26 October midnight itself', () => {
    expect(startOfBerlinWeek('2026-10-25T23:00:00.000Z').toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    );
  });

  it('rejects a zoneless string and an invalid date', () => {
    expect(() => startOfBerlinWeek('2026-03-29T00:30:00')).toThrow(TypeError);
    expect(() => startOfBerlinWeek('2026-03-29')).toThrow(TypeError);
    expect(() => startOfBerlinWeek('2026-13-40T00:00:00.000Z')).toThrow(TypeError);
  });
});

describe('generateWeekSlots', () => {
  it('builds the 48 opening-hour slots around the spring-forward Sunday', () => {
    const slots = generateWeekSlots('2026-03-29T10:00:00.000Z');

    expectOpeningWeek(slots);
    expect(slots[0].startsAt.toISOString()).toBe('2026-03-23T05:00:00.000Z');
    expect(slots[0].endsAt.toISOString()).toBe('2026-03-23T07:00:00.000Z');
    expect(slots.at(-1).startsAt.toISOString()).toBe('2026-03-28T19:00:00.000Z');
    expect(slots.at(-1).endsAt.toISOString()).toBe('2026-03-28T21:00:00.000Z');
  });

  it('returns the same instants for that Sunday and that Monday', () => {
    const fromSunday = generateWeekSlots('2026-03-29T10:00:00.000Z');
    const fromMonday = generateWeekSlots('2026-03-22T23:00:00.000Z');

    expect(slotInstants(fromSunday)).toEqual(slotInstants(fromMonday));
  });

  it('starts the week of 30 March at 06:00 Berlin summer time', () => {
    const slots = generateWeekSlots('2026-03-30T04:00:00.000Z');

    expectOpeningWeek(slots);
    expect(slots[0].startsAt.toISOString()).toBe('2026-03-30T04:00:00.000Z');
  });

  it('keeps summer time through the fall-back week and winter time after it', () => {
    const fallWeek = generateWeekSlots('2026-10-25T11:00:00.000Z');
    const nextWeek = generateWeekSlots('2026-10-25T23:00:00.000Z');

    expectOpeningWeek(fallWeek);
    expectOpeningWeek(nextWeek);
    expect(fallWeek[0].startsAt.toISOString()).toBe('2026-10-19T04:00:00.000Z');
    expect(nextWeek[0].startsAt.toISOString()).toBe('2026-10-26T05:00:00.000Z');
  });
});

describe('validateSlotStart', () => {
  it('accepts Monday 06:00 and Saturday 20:00', () => {
    expect(validateSlotStart('2026-03-30T04:00:00.000Z')).toEqual({ ok: true });
    expect(validateSlotStart('2026-03-28T19:00:00.000Z')).toEqual({ ok: true });
  });

  it('rejects a time between slots, a half hour, and a non-zero second', () => {
    expect(validateSlotStart('2026-03-30T05:00:00.000Z')).toEqual(outsideOpeningHours);
    expect(validateSlotStart('2026-03-30T04:30:00.000Z')).toEqual(outsideOpeningHours);
    expect(validateSlotStart('2026-03-30T04:00:01.000Z')).toEqual(outsideOpeningHours);
  });

  it('rejects Saturday closing time', () => {
    expect(validateSlotStart('2026-03-28T21:00:00.000Z')).toEqual(outsideOpeningHours);
  });

  it('rejects both daylight-saving Sundays', () => {
    expect(validateSlotStart('2026-03-29T04:00:00.000Z')).toEqual(outsideOpeningHours);
    expect(validateSlotStart('2026-10-25T07:00:00.000Z')).toEqual(outsideOpeningHours);
  });
});

describe('validateBookingWindow', () => {
  it('covers the current week and the next three from 1 April 2026', () => {
    const now = '2026-04-01T13:00:00.000Z';

    expect(validateBookingWindow('2026-03-29T22:00:00.000Z', now)).toEqual({ ok: true });
    expect(validateBookingWindow('2026-03-30T04:00:00.000Z', now)).toEqual({ ok: true });
    expect(validateBookingWindow('2026-04-25T18:00:00.000Z', now)).toEqual({ ok: true });
    expect(validateBookingWindow('2026-04-26T22:00:00.000Z', now)).toEqual(outsideBookingWindow);
    expect(validateBookingWindow('2026-04-27T04:00:00.000Z', now)).toEqual(outsideBookingWindow);
    expect(validateBookingWindow('2026-03-28T19:00:00.000Z', now)).toEqual(outsideBookingWindow);
  });

  it('ends on the fourth Monday when now is a daylight-saving Sunday', () => {
    expect(validateBookingWindow('2026-03-22T23:00:00.000Z', '2026-03-29T10:00:00.000Z')).toEqual({
      ok: true,
    });
    expect(validateBookingWindow('2026-04-19T22:00:00.000Z', '2026-03-29T10:00:00.000Z')).toEqual(
      outsideBookingWindow,
    );
    expect(validateBookingWindow('2026-10-18T22:00:00.000Z', '2026-10-25T11:00:00.000Z')).toEqual({
      ok: true,
    });
    expect(validateBookingWindow('2026-11-15T23:00:00.000Z', '2026-10-25T11:00:00.000Z')).toEqual(
      outsideBookingWindow,
    );
  });
});

describe('isSlotInPast', () => {
  it('treats now and earlier as past, and one millisecond later as not', () => {
    const now = '2026-04-01T13:00:00.000Z';

    expect(isSlotInPast(now, now)).toBe(true);
    expect(isSlotInPast('2026-04-01T12:59:59.999Z', now)).toBe(true);
    expect(isSlotInPast('2026-04-01T13:00:00.001Z', now)).toBe(false);
  });

  it('keeps a past Monday slot inside the booking window', () => {
    const now = '2026-04-01T13:00:00.000Z';
    const mondayOpening = '2026-03-30T04:00:00.000Z';

    expect(validateBookingWindow(mondayOpening, now)).toEqual({ ok: true });
    expect(isSlotInPast(mondayOpening, now)).toBe(true);
  });
});
