import { expect, it } from 'vitest';
import { calendarDuration } from './calendar-duration';
const start = Date.parse('2026-10-08T13:00:00Z');
const item = {
  effectiveStartedAt: new Date(start).toISOString(),
  effectiveEndedAt: new Date(start + 4 * 3600000).toISOString(),
  minutes: 180,
  loggedMinutes: 240,
  accountingSegments: [
    { startedAt: start, endedAt: start + 3600000, concurrent: 1 },
    { startedAt: start + 3600000, endedAt: start + 3 * 3600000, concurrent: 2 },
    {
      startedAt: start + 3 * 3600000,
      endedAt: start + 4 * 3600000,
      concurrent: 1,
    },
  ],
};
it('shows accounted time first and logged only when different', () => {
  expect(calendarDuration(item)).toBe('3h (logged: 4h)');
  expect(calendarDuration(item, start + 3 * 3600000, Infinity)).toBe('1h');
  expect(calendarDuration(item, start + 3600000, start + 3 * 3600000)).toBe(
    '1h (logged: 2h)',
  );
});
it('labels wall-clock duration explicitly when accounting context is unavailable', () => {
  expect(
    calendarDuration({
      ...item,
      minutes: undefined,
      accountingSegments: undefined,
    }),
  ).toBe('Logged: 4h');
});
