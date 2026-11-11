import { expect, it } from 'vitest';
import { dailyBusinessProgress } from './daily-business-progress';
const projects = new Map<string, Record<string, unknown>>([
  [
    'p',
    {
      businessHours: [
        { startDate: '2026-11-01', endDate: null, hoursPerDay: 8 },
      ],
    },
  ],
  ['off', {}],
]);
it('shows zero delivery on an expected working day and excludes disabled projects', () => {
  expect(dailyBusinessProgress('2026-11-03', projects, [], [])).toEqual([
    { projectId: 'p', expected: 8, delivered: 0 },
  ]);
});
it('preserves extra work on holidays and weekends with a zero target', () => {
  const start = Date.parse('2026-11-07T12:00:00Z'),
    end = start + 3600000;
  const items = [
    {
      projectId: 'p',
      effectiveStartedAt: new Date(start).toISOString(),
      effectiveEndedAt: new Date(end).toISOString(),
      accountingSegments: [{ startedAt: start, endedAt: end, concurrent: 1 }],
      timeMultiplier: 2,
    },
  ];
  expect(dailyBusinessProgress('2026-11-07', projects, [], items)).toEqual([
    { projectId: 'p', expected: 0, delivered: 2 },
  ]);
  expect(
    dailyBusinessProgress(
      '2026-11-03',
      projects,
      [{ date: '2026-11-03', name: 'Folga' }],
      [],
    )[0]!.expected,
  ).toBe(0);
});
it('clips cross-midnight intervals after overlap allocation and respects selected projects', () => {
  const start = Date.parse('2026-11-04T02:00:00Z'),
    end = Date.parse('2026-11-04T04:00:00Z');
  const items = [
    {
      projectId: 'p',
      effectiveStartedAt: new Date(start).toISOString(),
      effectiveEndedAt: new Date(end).toISOString(),
      accountingSegments: [{ startedAt: start, endedAt: end, concurrent: 2 }],
    },
  ];
  expect(
    dailyBusinessProgress('2026-11-03', projects, [], items)[0]!.delivered,
  ).toBe(0.5);
  expect(
    dailyBusinessProgress('2026-11-04', projects, [], items, ['off']),
  ).toEqual([]);
});
