import { expect, it } from 'vitest';
import {
  dailyBusinessProgress,
  dailyProgressPercent,
  isNonWorkingDay,
} from './daily-business-progress';
it('scales overtime against normal contract hours without doubling and caps visual overflow', () => {
  expect(
    dailyProgressPercent({
      projectId: 'p',
      expected: 0,
      dailyHours: 8,
      delivered: 2,
    }),
  ).toBe(25);
  expect(
    dailyProgressPercent({
      projectId: 'p',
      expected: 0,
      dailyHours: 3,
      delivered: 1.5,
    }),
  ).toBe(50);
  expect(
    dailyProgressPercent({
      projectId: 'p',
      expected: 0,
      dailyHours: 8,
      delivered: 12,
    }),
  ).toBe(100);
  expect(
    dailyProgressPercent({
      projectId: 'p',
      expected: 0,
      dailyHours: 0,
      delivered: 2,
    }),
  ).toBe(0);
  expect(isNonWorkingDay('2026-11-07')).toBe(true);
  expect(
    isNonWorkingDay('2026-11-03', [{ date: '2026-11-03', name: 'Folga' }]),
  ).toBe(true);
  expect(isNonWorkingDay('2026-11-03')).toBe(false);
});
it('marks annual holidays as nonworking across calendar years', () => {
  expect(
    isNonWorkingDay('2026-12-25', [
      {
        date: '2026-12-25',
        type: 'every_year_same_date' as const,
        name: 'Natal',
      },
    ]),
  ).toBe(true);
  expect(
    isNonWorkingDay('2028-12-25', [
      {
        date: '2026-12-25',
        type: 'every_year_same_date' as const,
        name: 'Natal',
      },
    ]),
  ).toBe(true);
});
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
    { projectId: 'p', expected: 8, dailyHours: 8, delivered: 0 },
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
    { projectId: 'p', expected: 0, dailyHours: 8, delivered: 2 },
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
