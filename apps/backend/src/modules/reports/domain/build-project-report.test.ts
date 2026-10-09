import { describe, expect, it } from 'vitest';
import { buildProjectReport, nextMidnight } from './build-project-report.js';
import type { ReportSourceRecord } from './project-report.js';
const make = (
  id: string,
  startedAt: string,
  extra: Partial<ReportSourceRecord> = {},
): ReportSourceRecord => ({
  id,
  uid: 'alice',
  projectId: 'project',
  startedAt,
  timeZone: 'UTC',
  topics: [],
  ...extra,
});
const report = (records: ReportSourceRecord[], asOf = '2026-10-09T20:00:00Z') =>
  buildProjectReport(
    'project',
    { records, topicLabels: { code: 'Código' }, nextCursor: null },
    200,
    Date.parse(asOf),
    { alice: 'Alice' },
    false,
    records,
  );
describe('project-report-v3', () => {
  it('caps open work at four hours and never persists estimates', () => {
    const input = [make('open', '2026-10-08T10:00:00Z')];
    const result = report(input);
    expect(result.totalMinutes).toBe(240);
    expect(result.estimatedCount).toBe(1);
    expect(input[0]).not.toHaveProperty('endedAt');
    expect(result.byUser).toEqual([
      { uid: 'alice', label: 'Alice', minutes: 240 },
    ]);
    expect(result.byTopic).toEqual([
      { topicId: '__unallocated__', label: 'Não distribuído', minutes: 240 },
    ]);
  });
  it('caps at now and next same user/project start, not another user', () => {
    const result = report(
      [
        make('a', '2026-10-08T10:00:00Z'),
        make('bob', '2026-10-08T10:30:00Z', { uid: 'bob' }),
        make('b', '2026-10-08T11:00:00Z'),
      ],
      '2026-10-08T11:30:00Z',
    );
    expect(result.records.find((r) => r.id === 'a')?.minutes).toBe(60);
    expect(result.records.find((r) => r.id === 'b')?.minutes).toBe(30);
    expect(result.byUser.find((r) => r.uid === 'bob')?.minutes).toBe(60);
  });
  it.each([
    ['2026-03-08T06:00:00Z', '2026-03-09T04:00:00Z'],
    ['2026-11-01T05:00:00Z', '2026-11-02T05:00:00Z'],
  ])('finds local midnight across DST from %s', (start, end) => {
    expect(
      new Date(
        nextMidnight(Date.parse(start), 'America/New_York'),
      ).toISOString(),
    ).toBe(end.replace('Z', '.000Z'));
  });
  it('caps an open record at local midnight', () => {
    const result = report([
      make('a', '2026-10-08T23:30:00-03:00', { timeZone: 'America/Sao_Paulo' }),
    ]);
    expect(result.totalMinutes).toBe(30);
  });
  it('caps only estimates at eight hours, preserving a closed twelve-hour fact', () => {
    const result = report([
      make('closed', '2026-10-08T00:00:00-03:00', {
        endedAt: '2026-10-08T12:00:00-03:00',
      }),
      make('a', '2026-10-08T00:00:00-03:00'),
      make('b', '2026-10-08T04:00:00Z'),
      make('c', '2026-10-08T08:00:00Z'),
    ]);
    expect(result.records.find((r) => r.id === 'closed')?.minutes).toBe(720);
    expect(
      result.records
        .filter((r) => r.estimated)
        .reduce((sum, r) => sum + r.minutes, 0),
    ).toBe(0);
    expect(result.totalMinutes).toBe(720);
    expect(result.warnings.some((w) => w.includes('sobreposições'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('global'))).toBe(true);
  });
  it('honors explicit topic percentages/durations and keeps undistributed remainder', () => {
    const result = report([
      make('a', '2026-10-08T10:00:00Z', {
        endedAt: '2026-10-08T12:00:00Z',
        topics: [
          { topicId: 'code', percentage: 25 },
          { topicId: 'meeting', durationMinutes: 20 },
        ],
      }),
    ]);
    expect(result.byTopic.map((t) => [t.topicId, t.minutes])).toEqual([
      ['code', 30],
      ['meeting', 20],
      ['__unallocated__', 70],
    ]);
  });
  it('allocates a single explicitly associated topic without inventing a split', () => {
    expect(
      report([
        make('a', '2026-10-08T10:00:00Z', { topics: [{ topicId: 'code' }] }),
      ]).byTopic[0]?.topicId,
    ).toBe('code');
  });
  it('preserves contradictory distributions with a warning', () => {
    const result = report([
      make('a', '2026-10-08T10:00:00Z', {
        endedAt: '2026-10-08T11:00:00Z',
        topics: [{ topicId: 'code', durationMinutes: 90, percentage: 20 }],
      }),
    ]);
    expect(result.byTopic[0]?.minutes).toBe(90);
    expect(result.warnings.some((w) => w.includes('excedem'))).toBe(true);
  });
  it('excludes invalid intervals/timezones and zeroes future open duration', () => {
    expect(() => report([make('invalid', 'bad')])).toThrow('Contexto');
    expect(() =>
      report([make('zone', '2026-10-08T10:00:00Z', { timeZone: 'bad' })]),
    ).toThrow('Fuso');
    const result = report([make('future', '2026-10-10T10:00:00Z')]);
    expect(result.totalMinutes).toBe(0);
    expect(result.records[0]?.effectiveEndedAt).toBe(
      '2026-10-10T10:00:00.000Z',
    );
  });
});
