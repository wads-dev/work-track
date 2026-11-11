import { expect, it } from 'vitest';
import { projectBusinessProgress } from './business-progress.js';
import type { ProjectReport } from '../../reports/domain/project-report.js';
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
  expect(rows.map((r) => r.month)).toEqual(['2026-11', '2026-10']);
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
  expect(rows).toHaveLength(4);
  expect(rows[1]!.delivered).toBe(0);
  expect(rows[0]!.expected).toBeGreaterThan(0);
});
