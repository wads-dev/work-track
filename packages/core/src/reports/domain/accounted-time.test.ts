import { expect, it } from 'vitest';
import { buildTimeAccounting, accountedMinutes } from './accounted-time.js';
import { buildPersonalReport } from './build-personal-report.js';
import { buildProjectReport } from './build-project-report.js';
import { buildTopicBreakdown } from './topic-breakdown.js';
import { buildDailyHours } from '../../daily-hours/domain/daily-hours.js';
import type { ReportSourceRecord } from './project-report.js';
const at = (hour: number) =>
  Date.parse('2026-10-08T00:00:00-03:00') + hour * 3600000;
const record = (
  id: string,
  start: number,
  end?: number,
  uid = 'alice',
): ReportSourceRecord => ({
  deletedAt: null,
  id,
  uid,
  projectId: id,
  startedAt: new Date(at(start)).toISOString(),
  ...(end === undefined ? {} : { endedAt: new Date(at(end)).toISOString() }),
  timeZone: 'America/Sao_Paulo',
  topics: [{ topicId: 'code', percentage: 100 }],
});
it('allocates 13–17 and 14–16 as 3h and 1h without changing facts', () => {
  const records = [record('a', 13, 17), record('b', 14, 16)],
    before = structuredClone(records);
  const engine = buildTimeAccounting(records, at(17));
  expect(records.map((r) => accountedMinutes(engine.segments(r)))).toEqual([
    180, 60,
  ]);
  expect(accountedMinutes(engine.segments(records[0]!, 14, 16))).toBe(0);
  expect(accountedMinutes(engine.segments(records[0]!, at(14), at(16)))).toBe(
    60,
  );
  expect(accountedMinutes(engine.segments(records[0]!, at(16), at(17)))).toBe(
    60,
  );
  expect(records).toEqual(before);
});
it('uses identical shares while first record is open, even in the same project', () => {
  const a = record('a', 13),
    b = { ...record('b', 14, 16), projectId: 'a' };
  const engine = buildTimeAccounting([a, b], at(17));
  expect(accountedMinutes(engine.segments(a))).toBe(180);
  expect(accountedMinutes(engine.segments(b))).toBe(60);
  expect(a.endedAt).toBeUndefined();
});
it('handles triple overlap, touching endpoints, zero intervals, deleted records and different authors', () => {
  const a = record('a', 10, 14),
    b = record('b', 11, 13),
    c = record('c', 12, 14),
    d = record('d', 14, 15);
  const records = [
    a,
    b,
    c,
    d,
    record('zero', 12, 12),
    { ...record('deleted', 10, 15), deletedAt: 'now' },
    record('bob', 10, 15, 'bob'),
  ];
  const engine = buildTimeAccounting(records, at(20));
  const values = [a, b, c, d].map((r) => accountedMinutes(engine.segments(r)));
  expect(values).toEqual([140, 50, 50, 60]);
  expect(values.reduce((a, b) => a + b, 0)).toBe(300);
  expect(accountedMinutes(engine.segments(records[6]!))).toBe(300);
});
it('keeps filtered project, clipped period and daily totals consistent with full context', () => {
  const a = record('a', 13, 17),
    b = record('b', 14, 16),
    context = [a, b];
  const personal = buildPersonalReport(
    {
      timeZone: 'America/Sao_Paulo',
      from: new Date(at(14)).toISOString(),
      to: new Date(at(16)).toISOString(),
    },
    { records: [a], scannedCount: 1, nextCursor: null },
    at(17),
    context,
  );
  expect(personal.totalMinutes).toBe(60);
  expect(personal.intervals[0]).toMatchObject({
    minutes: 60,
    loggedMinutes: 120,
  });
  const project = buildProjectReport(
    'a',
    { records: [a], topicLabels: { code: 'Code' }, nextCursor: null },
    100,
    at(17),
    {},
    false,
    context,
  );
  expect(project.totalMinutes).toBe(180);
  expect(project.byTopic[0]?.minutes).toBe(180);
  const daily = buildDailyHours(
    {
      date: '2026-10-08',
      timeZone: 'America/Sao_Paulo',
      includeArchived: true,
      projectId: 'a',
    },
    {
      records: context,
      selectedRecords: [a],
      projects: new Map([
        ['a', { type: 'work' }],
        ['b', { type: 'work' }],
      ]),
    },
    'alice',
    at(17),
  );
  expect(daily.totalMinutes).toBe(180);
});
it('integrates per day rather than prorating the entire record average', () => {
  const a = record('a', 23, 27),
    b = record('b', 23, 24);
  const engine = buildTimeAccounting([a, b], at(30));
  expect(accountedMinutes(engine.segments(a), at(23), at(24))).toBe(30);
  expect(accountedMinutes(engine.segments(a), at(24), at(27))).toBe(180);
});
it('applies overlap shares to explicit topic durations without mutating logged allocations', () => {
  const a = {
      ...record('a', 13, 17),
      topics: [{ topicId: 'code', durationMinutes: 120 }],
    },
    b = record('b', 14, 16);
  const result = buildProjectReport(
    'a',
    { records: [a], topicLabels: { code: 'Code' }, nextCursor: null },
    100,
    at(17),
    {},
    false,
    [a, b],
  );
  expect(result.totalMinutes).toBe(180);
  expect(result.byTopic[0]?.minutes).toBe(90);
  expect(result.unassignedMinutes).toBe(90);
  expect(a.topics[0]?.durationMinutes).toBe(120);
  const invalid = { ...a, topics: [{ topicId: 'code', durationMinutes: 300 }] };
  const breakdown = buildTopicBreakdown(
    [invalid],
    [
      {
        id: a.id,
        uid: a.uid,
        projectId: a.projectId,
        minutes: 180,
        loggedMinutes: 240,
      },
    ],
    new Map([['a', { topics: [{ id: 'code', title: 'Code' }] }]]),
  );
  expect(breakdown.byTopic).toEqual([]);
  expect(breakdown.unassignedMinutes).toBe(180);
});
it('rejects duplicated context identity and preserves input order independence', () => {
  const a = record('a', 13, 17),
    b = record('b', 14, 16);
  expect(() => buildTimeAccounting([a, a], at(17))).toThrow('duplicada');
  expect(
    accountedMinutes(buildTimeAccounting([b, a], at(17)).segments(a)),
  ).toBe(180);
});
