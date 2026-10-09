import { expect, it } from 'vitest';
import { occupiedWeeks } from './calendar-weeks.js';
const interval = (start: string, end: string) => ({
  effectiveStartedAt: start,
  effectiveEndedAt: end,
});
it('Mondaylocal halfopen midnight crossing DST gaps noemptyartificialweeks', () => {
  expect(
    occupiedWeeks(
      [interval('2026-10-04T23:00:00-03:00', '2026-10-05T00:00:00-03:00')],
      'America/Sao_Paulo',
    ),
  ).toEqual(['2026-09-28']);
  expect(
    occupiedWeeks(
      [interval('2026-10-04T23:00:00-03:00', '2026-10-05T00:01:00-03:00')],
      'America/Sao_Paulo',
    ),
  ).toEqual(['2026-09-28', '2026-10-05']);
  expect(
    occupiedWeeks(
      [interval('2026-03-08T01:30:00-05:00', '2026-03-09T00:00:00-04:00')],
      'America/New_York',
    ),
  ).toEqual(['2026-03-02']);
  expect(
    occupiedWeeks(
      [interval('2026-11-01T01:00:00-04:00', '2026-11-02T00:01:00-05:00')],
      'America/New_York',
    ),
  ).toEqual(['2026-10-26', '2026-11-02']);
  expect(occupiedWeeks([], 'UTC')).toEqual([]);
  expect(
    occupiedWeeks(
      [interval('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')],
      'UTC',
    ),
  ).toEqual([]);
});
it('huge multi-century intervals failclosed not silently truncated', () => {
  expect(() =>
    occupiedWeeks(
      [interval('1200-01-01T00:00:00Z', '2026-01-01T00:00:00Z')],
      'UTC',
    ),
  ).toThrow(/nenhuma lista parcial/);
});
