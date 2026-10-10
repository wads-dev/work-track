import { describe, expect, it, vi } from 'vitest';
import {
  buildDailyHours,
  dailyBounds,
  dailyHoursInput,
  getDailyHours,
  type DailyHoursContext,
} from './daily-hours.js';
import type { ReportSourceRecord } from '../../reports/domain/project-report.js';
const uid = 'alice',
  asOf = Date.parse('2026-10-09T23:00:00-03:00');
const record = (
  id: string,
  projectId: string,
  startedAt: string,
  endedAt?: string,
): ReportSourceRecord => ({
  id,
  projectId,
  uid,
  startedAt,
  ...(endedAt ? { endedAt } : {}),
  timeZone: 'America/Sao_Paulo',
  topics: [],
});
const context = (
  records: ReportSourceRecord[],
  projects: DailyHoursContext['projects'] = new Map([
    ['a', {}],
    ['b', { type: 'work', archived: true }],
    ['personal', { type: 'personal', createdBy: uid }],
  ]),
): DailyHoursContext => ({ records, projects });
const input = (extra: object = {}) =>
  dailyHoursInput.parse({ date: '2026-10-09', ...extra });
describe('daily-hours input and local-day boundaries', () => {
  it('accepts real calendar dates, defaults explicitly and rejects unknown UID', () => {
    expect(input()).toMatchObject({
      timeZone: 'America/Sao_Paulo',
      includeArchived: true,
    });
    expect(dailyHoursInput.safeParse({ date: '2024-02-29' }).success).toBe(
      true,
    );
    for (const date of [
      '2026-02-29',
      '2026-02-30',
      '2026-13-01',
      '2026-1-01',
      '2026-10-09T00:00:00Z',
      '0000-01-01',
    ])
      expect(dailyHoursInput.safeParse({ date }).success).toBe(false);
    for (const timeZone of ['not-a-zone', '+03:00', 'America/Fake'])
      expect(
        dailyHoursInput.safeParse({ date: '2026-10-09', timeZone }).success,
      ).toBe(false);
    expect(
      dailyHoursInput.safeParse({ date: '2026-10-09', uid: 'bob' }).success,
    ).toBe(false);
    expect(
      dailyHoursInput.safeParse({
        date: '2026-10-09',
        includeArchived: 'false',
      }).success,
    ).toBe(false);
  });
  it('uses actual 23h and 25h DST days and midnight boundaries', () => {
    for (const [date, hours] of [
      ['2026-03-08', 23],
      ['2026-11-01', 25],
    ] as const) {
      const { start, end } = dailyBounds(date, 'America/New_York');
      expect((end - start) / 3600000).toBe(hours);
    }
    const bounds = dailyBounds('2026-10-09', 'America/Sao_Paulo');
    expect(new Date(bounds.start).toISOString()).toBe(
      '2026-10-09T03:00:00.000Z',
    );
    expect(new Date(bounds.end).toISOString()).toBe('2026-10-10T03:00:00.000Z');
    expect(() => dailyBounds('2011-12-30', 'Pacific/Apia')).toThrow(
      'não existe',
    );
  });
});
describe('daily-hours factual versus estimated totals', () => {
  it('clips closed sources crossing midnight and never invents their ends', () => {
    const sources = [
      record(
        'before',
        'a',
        '2026-10-08T23:30:00-03:00',
        '2026-10-09T00:30:00-03:00',
      ),
      record(
        'after',
        'a',
        '2026-10-09T23:30:00-03:00',
        '2026-10-10T00:30:00-03:00',
      ),
      record(
        'outside',
        'a',
        '2026-10-10T00:00:00-03:00',
        '2026-10-10T01:00:00-03:00',
      ),
    ];
    const report = buildDailyHours(input(), context(sources), uid, asOf);
    expect(report).toMatchObject({
      totalMinutes: 60,
      totalHours: 1,
      closedMinutes: 60,
      estimatedMinutes: 0,
    });
    expect(report.intervals).toHaveLength(2);
    expect(report.intervals[0]).toMatchObject({
      startedAt: sources[0]!.startedAt,
      endedAt: sources[0]!.endedAt,
      effectiveStartedAt: '2026-10-09T03:00:00.000Z',
      minutes: 30,
      estimated: false,
    });
  });
  it('separates open estimates, honors next own same-project start and ignores tiny cuts', () => {
    const report = buildDailyHours(
      input(),
      context([
        record('open', 'a', '2026-10-09T09:00:00-03:00'),
        record(
          'tiny',
          'a',
          '2026-10-09T10:00:00-03:00',
          '2026-10-09T10:05:00-03:00',
        ),
        record(
          'next',
          'a',
          '2026-10-09T11:00:00-03:00',
          '2026-10-09T12:00:00-03:00',
        ),
      ]),
      uid,
      asOf,
    );
    expect(report).toMatchObject({
      closedMinutes: 65,
      estimatedMinutes: 120,
      totalMinutes: 185,
    });
    expect(report.intervals[0]).not.toHaveProperty('endedAt');
    expect(report.intervals[0]).toMatchObject({
      estimated: true,
      effectiveEndedAt: '2026-10-09T14:00:00.000Z',
    });
    expect(report.warnings).toContain('Há intervalos sobrepostos no dia.');
  });
  it('caps open estimates by now, six hours and midnight but preserves factual >8h', () => {
    expect(
      buildDailyHours(
        input(),
        context([record('open', 'a', '2026-10-09T22:00:00-03:00')]),
        uid,
        asOf,
      ).estimatedMinutes,
    ).toBe(60);
    expect(
      buildDailyHours(
        input(),
        context([record('open', 'a', '2026-10-09T22:00:00-03:00')]),
        uid,
        Date.parse('2026-10-10T10:00:00-03:00'),
      ).estimatedMinutes,
    ).toBe(120);
    expect(
      buildDailyHours(
        input(),
        context([record('open', 'a', '2026-10-09T09:00:00-03:00')]),
        uid,
        asOf,
      ).estimatedMinutes,
    ).toBe(360);
    expect(
      buildDailyHours(
        input(),
        context([
          record(
            'closed',
            'a',
            '2026-10-09T08:00:00-03:00',
            '2026-10-09T18:00:00-03:00',
          ),
        ]),
        uid,
        asOf,
      ).closedMinutes,
    ).toBe(600);
  });
  it('does not spend a daily budget before project and archived filtering', () => {
    const history = context([
      record(
        'closed',
        'b',
        '2026-10-09T07:00:00-03:00',
        '2026-10-09T13:00:00-03:00',
      ),
      record('open', 'a', '2026-10-09T14:00:00-03:00'),
    ]);
    expect(buildDailyHours(input(), history, uid, asOf)).toMatchObject({
      totalMinutes: 720,
      closedMinutes: 360,
      estimatedMinutes: 360,
    });
    expect(
      buildDailyHours(
        input({ projectId: 'a', includeArchived: false }),
        history,
        uid,
        asOf,
      ),
    ).toMatchObject({
      totalMinutes: 360,
      closedMinutes: 0,
      estimatedMinutes: 360,
      byProject: [{ projectId: 'a', estimatedMinutes: 360, estimatedHours: 6 }],
    });
    const opens = context([
      record('first', 'b', '2026-10-09T08:00:00-03:00'),
      record('second', 'personal', '2026-10-09T13:00:00-03:00'),
      record('third', 'a', '2026-10-09T18:00:00-03:00'),
    ]);
    expect(
      buildDailyHours(input({ projectId: 'a' }), opens, uid, asOf).totalMinutes,
    ).toBe(300);
  });
  it('excludes foreign personal, malformed type and foreign UID before parsing', () => {
    const projects = new Map([
      ['a', {}],
      ['foreign', { type: 'personal', createdBy: 'bob' }],
      ['bad', { type: null }],
      ['personal', { type: 'personal', createdBy: uid }],
    ]);
    const history = context(
      [
        record(
          'ok',
          'a',
          '2026-10-09T08:00:00-03:00',
          '2026-10-09T09:00:00-03:00',
        ),
        record('stale', 'foreign', 'invalid', 'also invalid'),
        record('invalidtype', 'bad', 'invalid'),
        { ...record('foreignuid', 'a', 'invalid'), uid: 'bob' },
        record(
          'own',
          'personal',
          '2026-10-09T10:00:00-03:00',
          '2026-10-09T11:00:00-03:00',
        ),
      ],
      projects,
    );
    expect(buildDailyHours(input(), history, uid, asOf).closedMinutes).toBe(
      120,
    );
    for (const projectId of ['foreign', 'bad', 'missing'])
      expect(() =>
        buildDailyHours(input({ projectId }), history, uid, asOf),
      ).toThrow('Projeto não encontrado.');
  });
  it('loads complete own context with authentication only and validates before reads', async () => {
    const loadOwnHistory = vi.fn().mockResolvedValue(context([]));
    const repo = { loadOwnHistory };
    await expect(
      getDailyHours(repo, { date: '2026-10-09', uid: 'bob' }, uid, asOf),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      getDailyHours(repo, { date: '2026-10-09' }, '', asOf),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(loadOwnHistory).not.toHaveBeenCalled();
    await getDailyHours(repo, { date: '2026-10-09' }, uid, asOf);
    expect(loadOwnHistory).toHaveBeenCalledWith(uid, undefined);
  });
});
