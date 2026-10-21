import { expect, it } from 'vitest';
import { pendingCalendarPath } from './pending-calendar';

it.each([
  ['2026-10-11T12:00:00Z', '2026-10-11'],
  ['2026-10-11T01:30:00Z', '2026-10-10'],
  ['2026-01-01T00:15:00Z', '2025-12-31'],
  ['2026-10-11T23:30:00-03:00', '2026-10-11'],
])('opens the start day in calendar time for %s', (startedAt, day) => {
  const url = new URL(
    pendingCalendarPath('r &?', startedAt),
    'https://test.invalid',
  );
  expect(url.pathname).toBe('/calendar');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    view: 'day',
    record: 'r &?',
    date: day,
  });
});

it.each([null, undefined, '', 'invalid'])(
  'does not invent a start day for %s',
  (startedAt) => {
    expect(pendingCalendarPath('r', startedAt)).toBe(
      '/calendar?view=day&record=r',
    );
  },
);
