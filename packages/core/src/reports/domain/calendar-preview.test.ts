import { expect, it } from 'vitest';
import { calendarPreview } from './calendar-preview.js';
const record = {
  id: 'r',
  uid: 'alice',
  projectId: 'p',
  startedAt: '2026-11-09T02:00:00Z',
  endedAt: '2026-11-09T06:00:00Z',
  timeZone: 'America/Sao_Paulo',
  topics: [],
};
it('clips factual logged time without inventing computed totals', () => {
  const value = calendarPreview(
    [record],
    '2026-11-09T03:00:00Z',
    '2026-11-10T03:00:00Z',
    'America/Sao_Paulo',
    Date.parse('2026-11-11T12:00:00Z'),
  );
  expect(value.intervals[0]!.loggedMinutes).toBe(180);
  expect(value.intervals[0]!.calculationPending).toBe(true);
  expect(value.intervals[0]!.minutes).toBe(0);
  expect(value.calculationPending).toBe(true);
  expect(value.byProject).toEqual([{ projectId: 'p', minutes: 0 }]);
});
it('places open occurrences up to now for display without persisting an end or computed totals', () => {
  const { endedAt, ...open } = record;
  expect(endedAt).toBeDefined();
  const value = calendarPreview(
    [open],
    '2026-11-08T03:00:00Z',
    '2026-11-10T03:00:00Z',
    'America/Sao_Paulo',
    Date.parse('2026-11-09T05:00:00Z'),
  );
  expect(Date.parse(value.intervals[0]!.effectiveEndedAt)).toBe(
    Date.parse('2026-11-09T05:00:00Z'),
  );
  expect(value.intervals[0]!.loggedMinutes).toBeUndefined();
  expect(value.intervals[0]).not.toHaveProperty('endedAt');
  expect(value.intervals[0]!.minutes).toBe(0);
});
