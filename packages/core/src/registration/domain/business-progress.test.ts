import { expect, it } from 'vitest';
import { projectBusinessProgress } from './business-progress.js';
import { monthBusinessHours } from './business-hours.js';
import type { ProjectReport } from '../../reports/domain/project-report.js';
it('rejects incomplete reports rather than publishing a partial carry', () => {
  const incomplete = report([]);
  incomplete.page.partial = true;
  expect(() =>
    projectBusinessProgress(incomplete, [], [], new Date(), {
      carryBalance: true,
    }),
  ).toThrow('incompleto');
});
it('counts unique holiday dates, weekend holidays and partial contracts', () => {
  const calendar = monthBusinessHours(
    '2026-11',
    [{ startDate: '2026-11-16', endDate: '2026-11-20', hoursPerDay: 4 }],
    [
      { date: '2026-11-15', name: 'Domingo' },
      { date: '2026-11-20', name: 'Anual', type: 'every_year_same_date' },
      { date: '2026-11-20', name: 'Específico' },
    ],
    '2026-11-30',
  );
  expect(calendar).toMatchObject({
    businessDays: 20,
    holidayDays: 2,
    weekdayHolidays: 1,
    contractedBusinessDays: 4,
    total: 16,
  });
});
it('projects across years, respects contract end and validates the horizon', () => {
  const periods = [
    { startDate: '2026-12-01', endDate: '2027-01-04', hoursPerDay: 8 },
  ];
  const rows = projectBusinessProgress(
    report([]),
    periods,
    [],
    new Date('2026-12-31T12:00:00Z'),
    { futureMonths: 2 },
  );
  expect(rows.map((r) => r.month)).toEqual(['2027-02', '2027-01', '2026-12']);
  expect(rows[0]).toMatchObject({ total: 0, expected: 0, future: true });
  expect(rows[1]).toMatchObject({ total: 16, expected: 0 });
  expect(rows[0]).not.toHaveProperty('openingBalance');
  for (const futureMonths of [-1, 25, 1.5, NaN])
    expect(() =>
      projectBusinessProgress(report([]), periods, [], new Date(), {
        futureMonths,
      }),
    ).toThrow();
});
it('carries signed balances through empty months without modifying delivery or targets', () => {
  const periods = [
    { startDate: '2026-09-30', endDate: '2026-10-01', hoursPerDay: 8 },
  ];
  const source = report([
    {
      id: 'r',
      uid: 'a',
      projectId: 'p',
      startedAt: '2026-09-30T12:00:00Z',
      effectiveEndedAt: '2026-09-30T22:00:00Z',
      estimated: false,
      minutes: 600,
      topics: [],
    },
  ]);
  const rows = projectBusinessProgress(
    source,
    periods,
    [],
    new Date('2026-11-14T12:00:00Z'),
    { futureMonths: 1, carryBalance: true },
  );
  expect(rows[3]).toMatchObject({
    openingBalance: 0,
    closingBalance: 2,
    delivered: 10,
    total: 8,
  });
  expect(rows[2]).toMatchObject({
    openingBalance: 2,
    closingBalance: -6,
    delivered: 0,
    total: 8,
  });
  expect(rows[1]).toMatchObject({
    openingBalance: -6,
    closingBalance: -6,
    projected: true,
  });
  expect(rows[0]).toMatchObject({
    openingBalance: -6,
    closingBalance: -6,
    future: true,
  });
  expect(
    projectBusinessProgress(
      source,
      periods,
      [],
      new Date('2026-11-14T12:00:00Z'),
      { currentOnly: true },
    ),
  ).toHaveLength(1);
});
const contract = [{ startDate: '2026-01-01', endDate: null, hoursPerDay: 8 }];
function report(records: ProjectReport['records']): ProjectReport {
  return {
    projectId: 'p',
    asOf: '2026-11-11T12:00:00Z',
    policy: 'project-report-v4',
    budgetTimeZone: 'America/Sao_Paulo',
    totalMinutes: 0,
    byUser: [
      { uid: 'a', label: 'Alice', minutes: 0 },
      { uid: 'b', label: 'Bob', minutes: 0 },
    ],
    records,
    estimatedCount: 0,
    warnings: [],
    page: { limit: 200, nextCursor: null, partial: false },
    byTopic: [],
    unassignedMinutes: 0,
  };
}
it('splits delivered accounting at month boundaries and preserves multiplier and rateio', () => {
  const start = Date.parse('2026-11-01T02:00:00Z'),
    end = Date.parse('2026-11-01T04:00:00Z');
  const rows = projectBusinessProgress(
    report([
      {
        id: 'r',
        uid: 'a',
        projectId: 'p',
        startedAt: new Date(start).toISOString(),
        effectiveEndedAt: new Date(end).toISOString(),
        estimated: false,
        minutes: 120,
        timeMultiplier: 2,
        accountingSegments: [{ startedAt: start, endedAt: end, concurrent: 2 }],
        topics: [],
      },
    ]),
    contract,
    [],
    new Date('2026-11-11T12:00:00Z'),
  );
  expect(rows).toHaveLength(11);
  expect(rows.slice(0, 2).map((r) => r.month)).toEqual(['2026-11', '2026-10']);
  expect(rows[0]!.delivered).toBe(1);
  expect(rows[1]!.delivered).toBe(1);
  expect(rows[0]!.people[0]!.label).toBe('Alice');
});
it('includes empty intermediate months and current month with zero delivery', () => {
  const rows = projectBusinessProgress(
    report([
      {
        id: 'r',
        uid: 'a',
        projectId: 'p',
        startedAt: '2026-08-03T12:00:00Z',
        effectiveEndedAt: '2026-08-03T13:00:00Z',
        estimated: false,
        minutes: 60,
        topics: [],
      },
    ]),
    contract,
    [],
    new Date('2026-11-11T12:00:00Z'),
  );
  expect(rows).toHaveLength(11);
  expect(rows[1]!.delivered).toBe(0);
  expect(rows[0]!.expected).toBeGreaterThan(0);
});
