import { expect, it } from 'vitest';
import { buildPersonalReport as build } from './build-personal-report.js';
const buildPersonalReport = (
  input: Parameters<typeof build>[0],
  page: Parameters<typeof build>[1],
  now: number,
) => build(input, page, now, page.records);
import type { ReportSourceRecord } from './project-report.js';
const make = (
  id: string,
  startedAt: string,
  projectId = 'a',
  endedAt?: string,
): ReportSourceRecord => ({
  id,
  startedAt,
  projectId,
  uid: 'alice',
  timeZone: 'UTC',
  topics: [],
  ...(endedAt ? { endedAt } : {}),
});
const input = {
  from: '2026-10-08T00:00:00Z',
  to: '2026-10-09T00:00:00Z',
  timeZone: 'UTC',
  limit: 200,
};
const run = (records: ReportSourceRecord[]) =>
  buildPersonalReport(
    input,
    { records, scannedCount: records.length, nextCursor: null },
    Date.parse('2026-10-08T20:00:00Z'),
  );
it('uses next own start across projects and returns original facts without mutation', () => {
  const records = [
    make('one', '2026-10-08T10:00:00Z'),
    make('two', '2026-10-08T11:00:00Z', 'b'),
  ];
  const result = run(records);
  expect(result.intervals[0]?.minutes).toBe(60);
  expect(result.byProject).toEqual([
    { projectId: 'a', minutes: 60 },
    { projectId: 'b', minutes: 240 },
  ]);
  expect(records[0]).not.toHaveProperty('endedAt');
  expect(result.policy).toBe('personal-v2');
});
it('clamps visualization only, includes intersecting closed facts, excludes outside', () => {
  const result = run([
    make('fact', '2026-10-07T23:00:00Z', 'a', '2026-10-08T02:00:00Z'),
    make('outside', '2026-10-07T10:00:00Z', 'a', '2026-10-07T11:00:00Z'),
  ]);
  expect(result.totalMinutes).toBe(120);
  expect(result.intervals[0]).toMatchObject({
    startedAt: '2026-10-07T23:00:00Z',
    endedAt: '2026-10-08T02:00:00Z',
    effectiveStartedAt: input.from.replace('Z', '.000Z'),
  });
  expect(result.page.excludedCount).toBe(1);
});
it('preserves closed facts beyond8h and spends their budget across projects', () => {
  const result = run([
    make('fact', '2026-10-08T00:00:00Z', 'a', '2026-10-08T12:00:00Z'),
    make('open', '2026-10-08T13:00:00Z', 'b'),
  ]);
  expect(result.totalMinutes).toBe(720);
  expect(result.estimatedCount).toBe(0);
});
it('warns overlaps and partial page, zeroes future opens', () => {
  const result = buildPersonalReport(
    { ...input, cursor: 'old' },
    {
      records: [
        make('a', '2026-10-08T10:00:00Z', 'a', '2026-10-08T12:00:00Z'),
        make('b', '2026-10-08T11:00:00Z', 'b', '2026-10-08T13:00:00Z'),
        make('future', '2026-10-08T23:00:00Z'),
      ],
      scannedCount: 3,
      nextCursor: 'next',
    },
    Date.parse('2026-10-08T20:00:00Z'),
  );
  expect(result.totalMinutes).toBe(240);
  expect(result.page.partial).toBe(true);
  expect(result.warnings.some((w) => w.includes('sobrepostos'))).toBe(true);
});
it('caps additionally at report midnight when record timezone differs', () => {
  const record = {
    ...make('different', '2026-10-08T23:30:00Z'),
    timeZone: 'America/Sao_Paulo',
  };
  const result = buildPersonalReport(
    input,
    { records: [record], scannedCount: 1, nextCursor: null },
    Date.parse('2026-10-09T10:00:00Z'),
  );
  expect(result.totalMinutes).toBe(30);
  expect(result.warnings.some((w) => w.includes('global'))).toBe(true);
});
it('caps at local midnight across DST', () => {
  const record = {
    ...make('dst', '2026-11-01T23:30:00-05:00'),
    timeZone: 'America/New_York',
  };
  const result = buildPersonalReport(
    {
      from: '2026-11-01T00:00:00-04:00',
      to: '2026-11-02T00:00:00-05:00',
      timeZone: 'America/New_York',
    },
    { records: [record], scannedCount: 1, nextCursor: null },
    Date.parse('2026-11-02T12:00:00Z'),
  );
  expect(result.totalMinutes).toBe(30);
});
