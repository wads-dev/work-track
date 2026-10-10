import { describe, expect, it } from 'vitest';
import { calendarQueryBounds } from './calendar-firestore-query';
import {
  ClientPersonalReportRepository,
  type ClientReportProject,
} from './personal-report-repository';
import { ownCalendarRepository } from './own-calendar-repository';
import { executeCalendarReport } from '../../backend/src/modules/reports/application/get-calendar-report';
import { calendarInput } from '../../backend/src/modules/reports/application/calendar-input';
import {
  globalEstimates,
  recordKey,
} from '../../backend/src/modules/reports/domain/global-estimates';
import type { ReportSourceRecord } from '../../backend/src/modules/reports/domain/project-report';

const uid = 'alice';
const make = (
  id: string,
  projectId: string,
  startedAt: string,
  endedAt?: string,
  timeZone = 'America/Sao_Paulo',
): ReportSourceRecord => ({
  id,
  uid,
  projectId,
  startedAt,
  ...(endedAt ? { endedAt } : {}),
  timeZone,
  topics: [],
});
const projects = new Map<string, ClientReportProject>([
  ['p', { type: 'personal', createdBy: uid, topics: [] }],
  ['other', { type: 'work', topics: [] }],
  ['archived', { type: 'work', archived: true, topics: [] }],
  ['foreign', { type: 'personal', createdBy: 'bob', topics: [] }],
]);
function bounded(records: ReportSourceRecord[], from: string, to: string) {
  const { lower, upper } = calendarQueryBounds({ from, to });
  // Exact two lexical predicates used by the Web SDK query builder, not UTC ordering.
  return records.filter(
    (r) =>
      (r.startedAt >= lower && r.startedAt < upper) ||
      (r.endedAt !== undefined && r.endedAt >= lower && r.startedAt < upper),
  );
}
function repository(records: ReportSourceRecord[], projectId?: string) {
  const selectedIds = projectId
    ? new Set(records.filter((r) => r.projectId === projectId).map((r) => r.id))
    : undefined;
  const own = new ClientPersonalReportRepository(
    uid,
    records,
    projects,
    selectedIds,
  );
  return ownCalendarRepository(own, uid);
}
async function run(
  records: ReportSourceRecord[],
  from: string,
  to: string,
  timeZone = 'UTC',
  projectId?: string,
) {
  return executeCalendarReport(
    repository(records, projectId),
    calendarInput.parse({ mode: 'own', from, to, timeZone, projectId }),
    uid,
    Date.parse(to),
  );
}
type CalendarResult = Awaited<ReturnType<typeof run>>;
function numeric(result: CalendarResult) {
  return {
    totalMinutes: result.totalMinutes,
    estimatedCount: result.estimatedCount,
    intervals: result.intervals
      .map((r) => ({
        id: r.id,
        projectId: r.projectId,
        start: r.effectiveStartedAt,
        end: r.effectiveEndedAt,
        minutes: r.minutes,
        estimated: r.estimated,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    byUser: result.byUser.map((r) => ({ uid: r.uid, minutes: r.minutes })),
  };
}
async function parity(
  records: ReportSourceRecord[],
  from: string,
  to: string,
  zone = 'UTC',
  projectId?: string,
) {
  const reduced = bounded(records, from, to);
  const fullRepo = repository(records),
    boundedRepo = repository(reduced);
  const fullContext = await fullRepo.own.loadContext([uid]);
  const boundedContext = await boundedRepo.own.loadContext([uid]);
  const clip = (context: ReportSourceRecord[], reportZone?: string) => {
    const estimates = globalEstimates(context, Date.parse(to), reportZone);
    return context
      .flatMap((r) => {
        const start = Math.max(Date.parse(from), Date.parse(r.startedAt));
        const end = Math.min(Date.parse(to), estimates.ends.get(recordKey(r))!);
        return end > start ? [{ id: r.id, start, end }] : [];
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  };
  expect(clip(boundedContext)).toEqual(clip(fullContext));
  expect(clip(boundedContext, zone)).toEqual(clip(fullContext, zone));
  const full = await run(records, from, to, zone, projectId);
  const limited = await run(reduced, from, to, zone, projectId);
  expect(numeric(limited)).toEqual(numeric(full));
  return { full, limited };
}
const ancient = make(
  'ancient',
  'p',
  '2020-01-01T12:00:00Z',
  '2020-01-01T13:00:00Z',
);

describe('actual calendar use case: adversarial numeric bounded-context parity', () => {
  it.each([
    [
      'spring',
      '2026-03-08T00:00:00-08:00',
      '2026-03-09T00:00:00-07:00',
      '2026-03-08T01:30:00-08:00',
      '2026-03-08T03:30:00-07:00',
      23,
    ],
    [
      'fall',
      '2026-11-01T00:00:00-07:00',
      '2026-11-02T00:00:00-08:00',
      '2026-11-01T01:30:00-07:00',
      '2026-11-01T01:30:00-08:00',
      25,
    ],
  ])(
    'LA DST %s uses elapsed instants across a %s-hour local day',
    async (_name, from, to, start, end, dayHours) => {
      expect((Date.parse(to) - Date.parse(from)) / 3_600_000).toBe(dayHours);
      const { limited } = await parity(
        [
          ancient,
          make('transition', 'p', start, end, 'America/Los_Angeles'),
          make('open', 'other', end, undefined, 'America/Los_Angeles'),
        ],
        from,
        to,
        'America/Los_Angeles',
      );
      expect(
        limited.intervals.find((r) => r.id === 'transition')?.minutes,
      ).toBe(60);
    },
  );

  it('retains +14 and -12 facts spanning UTC midnight with offset-aware clipping', async () => {
    const { limited } = await parity(
      [
        ancient,
        make(
          'plus14',
          'p',
          '2026-10-09T00:30:00+14:00',
          '2026-10-09T01:30:00+14:00',
          'Pacific/Kiritimati',
        ),
        make(
          'minus12',
          'other',
          '2026-10-07T23:30:00-12:00',
          '2026-10-08T00:30:00-12:00',
          'Etc/GMT+12',
        ),
        make('open', 'p', '2026-10-08T13:00:00Z'),
      ],
      '2026-10-08T00:00:00Z',
      '2026-10-09T00:00:00Z',
    );
    expect(
      limited.intervals.filter((r) => !r.estimated).map((r) => r.minutes),
    ).toEqual([60, 60]);
  });

  it.each([
    ['14m59s', '2026-10-08T13:14:59Z', 180],
    ['15m', '2026-10-08T13:15:00Z', 60],
  ])(
    'next closed %s applies the exact 15-minute cut threshold',
    async (_name, end, expected) => {
      const records = [
        ancient,
        make('open', 'p', '2026-10-08T12:00:00Z'),
        make('candidate', 'p', '2026-10-08T13:00:00Z', end),
        make('next', 'p', '2026-10-08T15:00:00Z', '2026-10-08T15:15:00Z'),
      ];
      const { limited } = await parity(
        records,
        '2026-10-08T00:00:00Z',
        '2026-10-09T00:00:00Z',
      );
      expect(limited.intervals.find((r) => r.id === 'open')?.minutes).toBe(
        expected,
      );
    },
  );

  it('same-start estimates spend chronological ID-ordered saldo regardless of input order', async () => {
    const records = [
      ancient,
      make('z', 'other', '2026-10-08T12:00:00Z'),
      make('a', 'p', '2026-10-08T12:00:00Z'),
      make('closed', 'other', '2026-10-08T04:00:00Z', '2026-10-08T09:00:00Z'),
    ];
    const { limited } = await parity(
      records,
      '2026-10-08T00:00:00Z',
      '2026-10-09T00:00:00Z',
    );
    expect(limited.intervals.find((r) => r.id === 'a')?.minutes).toBe(360);
    expect(limited.intervals.find((r) => r.id === 'z')?.minutes).toBe(360);
    expect(
      numeric(
        await run(
          [...records].reverse(),
          '2026-10-08T00:00:00Z',
          '2026-10-09T00:00:00Z',
        ),
      ),
    ).toEqual(numeric(limited));
  });

  it('cross-project and authorized archived facts exhaust 480 minutes; foreign personal and tombstones do not', async () => {
    const deleted = {
      ...make(
        'deleted',
        'other',
        '2026-10-08T03:00:00Z',
        '2026-10-08T23:00:00Z',
      ),
      deletedAt: '2026-10-08T23:30:00Z',
    };
    const records = [
      ancient,
      deleted,
      make(
        'foreign',
        'foreign',
        '2026-10-08T03:00:00Z',
        '2026-10-08T23:00:00Z',
      ),
      make('facts', 'other', '2026-10-08T04:00:00Z', '2026-10-08T09:00:00Z'),
      make(
        'archive-facts',
        'archived',
        '2026-10-08T09:00:00Z',
        '2026-10-08T12:00:00Z',
      ),
      make('open', 'p', '2026-10-08T13:00:00Z'),
      make(
        'selected-fact',
        'p',
        '2026-10-08T14:00:00Z',
        '2026-10-08T14:30:00Z',
      ),
    ];
    const { limited } = await parity(
      records,
      '2026-10-08T00:00:00Z',
      '2026-10-09T00:00:00Z',
      'UTC',
      'p',
    );
    expect(limited.totalMinutes).toBe(90);
    expect(limited.intervals.map((r) => r.id)).toEqual([
      'open',
      'selected-fact',
    ]);
    const context = await repository(records).own.loadContext([uid]);
    expect(context.map((r) => r.id)).toContain('archive-facts');
    expect(context.map((r) => r.id)).not.toContain('deleted');
    expect(context.map((r) => r.id)).not.toContain('foreign');
    expect(
      globalEstimates(context, Date.parse('2026-10-09T00:00:00Z')).ends.get(
        uid + '/open',
      ),
    ).toBe(Date.parse('2026-10-08T14:00:00Z'));
  });
});

describe('documented non-equivalence outside numeric visible intervals', () => {
  const from = '2026-10-08T00:00:00Z',
    to = '2026-10-09T00:00:00Z';
  const current = make(
    'current',
    'p',
    '2026-10-08T12:00:00Z',
    '2026-10-08T13:00:00Z',
  );
  it('ancient invalid open timezone fails full context but is absent from bounded context', async () => {
    const records = [
      make(
        'invalid-ancient',
        'other',
        '2020-01-01T12:00:00Z',
        undefined,
        'Invalid/Ancient',
      ),
      current,
    ];
    await expect(run(records, from, to)).rejects.toThrow(
      'Fuso inválido no contexto global',
    );
    const limited = await run(bounded(records, from, to), from, to);
    expect(limited.totalMinutes).toBe(60);
    expect(() => globalEstimates(records, Date.parse(to))).toThrow(
      'Fuso inválido',
    );
  });
  it('ancient mixed-zone warnings and historical scan/exclusion counts differ despite numeric parity', async () => {
    const records = [
      make(
        'mixed-ancient',
        'other',
        '2020-01-01T12:00:00Z',
        '2020-01-01T13:00:00Z',
        'UTC',
      ),
      current,
    ];
    const { full, limited } = await parity(records, from, to);
    expect(full.warnings.some((w) => w.includes('Fusos mistos'))).toBe(true);
    expect(limited.warnings.some((w) => w.includes('Fusos mistos'))).toBe(
      false,
    );
    expect(full.page.scannedCount).toBe(2);
    expect(limited.page.scannedCount).toBe(1);
    expect(full.page.excludedCount).toBe(1);
    expect(limited.page.excludedCount).toBe(0);
  });
  it('full-history context cap can reject when a bounded snapshot succeeds', async () => {
    const records = [
      current,
      ...Array.from({ length: 2000 }, (_, i) =>
        make(
          'ancient-' + i,
          'other',
          '2020-01-01T12:00:00Z',
          '2020-01-01T13:00:00Z',
        ),
      ),
    ];
    await expect(run(records, from, to)).rejects.toThrow('2000 registros');
    expect((await run(bounded(records, from, to), from, to)).totalMinutes).toBe(
      60,
    );
  });
});
