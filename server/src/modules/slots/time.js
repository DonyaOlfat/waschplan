import { DateTime } from 'luxon';

export const BERLIN_ZONE = 'Europe/Berlin';

const ENDS_WITH_Z = /Z$/i;
const ENDS_WITH_NUMERIC_OFFSET = /[+-]\d{2}(?::?\d{2})?$/;
const HAS_TIME = /T\d{2}:\d{2}/i;

export function startOfBerlinWeek(instant) {
  const berlin = toBerlinDateTime(instant);

  // weekday is ISO: 1 is Monday, 7 is Sunday. startOf('week') follows the
  // process locale and can treat Sunday as the first day.
  return berlin
    .minus({ days: berlin.weekday - 1 })
    .startOf('day')
    .toJSDate();
}

export function toBerlinDateTime(instant) {
  if (instant instanceof Date) {
    if (Number.isNaN(instant.getTime())) {
      throw new TypeError('Invalid date.');
    }

    const berlin = DateTime.fromJSDate(instant, { zone: BERLIN_ZONE });

    if (!berlin.isValid) {
      throw new TypeError('Invalid date.');
    }

    return berlin;
  }

  if (typeof instant !== 'string') {
    throw new TypeError('Instant must be a Date or an ISO 8601 string.');
  }

  const value = instant.trim();

  if (!hasZoneOffset(value)) {
    throw new TypeError('Instant must include a timezone offset.');
  }

  const parsed = DateTime.fromISO(value, { setZone: true });

  if (!parsed.isValid) {
    throw new TypeError('Invalid date.');
  }

  return parsed.setZone(BERLIN_ZONE);
}

export function parseBerlinDate(isoDate) {
  if (typeof isoDate !== 'string') {
    throw new TypeError('Date must be YYYY-MM-DD.');
  }

  const parsed = DateTime.fromISO(isoDate, { zone: BERLIN_ZONE });

  if (!parsed.isValid || parsed.toISODate() !== isoDate) {
    throw new TypeError('Date must be YYYY-MM-DD.');
  }

  return parsed.startOf('day').toJSDate();
}

function hasZoneOffset(value) {
  if (ENDS_WITH_Z.test(value)) {
    return true;
  }

  // The day in 2026-03-29 matches a numeric offset, so require a time first.
  return ENDS_WITH_NUMERIC_OFFSET.test(value) && HAS_TIME.test(value);
}
