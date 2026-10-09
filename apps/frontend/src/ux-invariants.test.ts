import { describe, expect, it } from 'vitest';
import { contextualRecordPath, detailPath, safeReturnTo } from './routes';
import { isHidden, safeProject, safeRecord } from './privacy';
import { endToLocal, localEndToIso, validateEnd } from './record-edit';
import {
  calendarDays,
  customRange,
  midnight,
  moveReference,
  overlaps,
  range,
} from './calendar-utils';
import {
  axisSegments,
  commonGaps,
  commonSpan,
  layoutDay,
  projectMinute,
} from './timeline-layout';

import { archivedProject, matchesArchive } from './project-archive';
import { isAlertOpen, isOpen } from './pending-utils';
import { hours, pieSlices } from './report-chart';
import { reportError } from './report-error';

const zone = 'America/Sao_Paulo';
describe('navigation and privacy remain intact across visual redesign', () => {
  it.each([
    'https://evil.test',
    '//evil.test',
    '/me/nested',
    '/app/deep',
    '/unknown',
  ])('rejects unsafe return %s', (value) => {
    expect(safeReturnTo(value)).toBe('/app');
  });
  it('preserves contextual report filters when opening a record', () => {
    const path = contextualRecordPath(
      '/calendar',
      '?date=2026-10-08&view=week&density=timeline',
      'record / 1',
    );
    const url = new URL(path, 'https://work-track.invalid');
    expect(url.pathname).toBe('/calendar');
    expect(url.searchParams.get('view')).toBe('week');
    expect(url.searchParams.get('record')).toBe('record / 1');
    expect(safeReturnTo(path)).toBe(path);
    expect(detailPath('records', 'a/b', '?from=2026-10-01')).toBe(
      '/records/a%2Fb?from=2026-10-01',
    );
  });
  it('never discloses titles descriptions topics or raw record fields in safe mode', () => {
    const project = {
      id: 'p',
      title: 'Private title',
      description: 'Private description',
      confidential: true,
      publicAlias: 'Secret public alias',
      topics: ['Private topic'],
    };
    expect(isHidden(project, false)).toBe(true);
    const masked = safeProject(project, false);
    expect(JSON.stringify(masked)).not.toContain('Private');
    expect(JSON.stringify(masked)).not.toContain('Secret');
    expect(masked.topics).toEqual([]);
    const record = {
      id: 'r',
      uid: 'u',
      projectId: 'p',
      startedAt: '2026-10-08T10:00:00-03:00',
      originalText: 'Secret speech',
      interpretation: 'Secret inference',
      extra: 'Secret extra',
    };
    expect(JSON.stringify(safeRecord(record, true))).not.toContain('Secret');
    expect(safeRecord(record, true).startedAt).toBe(record.startedAt);
    expect(safeProject(project, true)).toBe(project);
    expect(safeRecord(record, false)).toBe(record);
    expect(isHidden(undefined, true)).toBe(true);
  });
});

describe('editing remains explicit and date bounds remain trustworthy', () => {
  it('keeps a real end in São Paulo without inventing one for an open activity', () => {
    expect(endToLocal(null)).toBe('');
    expect(endToLocal('not a date')).toBe('');
    expect(endToLocal('2026-10-08T14:30:00Z')).toBe('2026-10-08T11:30');
    expect(localEndToIso('2026-10-08T11:30')).toBe('2026-10-08T11:30:00-03:00');
    expect(() => localEndToIso('')).toThrow();
    expect(() =>
      validateEnd('2026-10-08T09:00:00-03:00', '2026-10-08T10:00:00-03:00'),
    ).toThrow();
    expect(() =>
      validateEnd('2026-10-08T11:00:00', '2026-10-08T10:00:00-03:00'),
    ).toThrow();
  });
  it('uses inclusive day bounds and local midnight', () => {
    expect(midnight('2026-10-08', zone)).toBe('2026-10-08T03:00:00.000Z');
    const week = range('2026-10-08', 'week', zone);
    expect(week.first).toBe('2026-10-05');
    expect(week.count).toBe(7);
    expect(customRange('2026-10-08', '2026-10-09', zone).count).toBe(2);
    expect(() => customRange('2026-10-09', '2026-10-08', zone)).toThrow();
    expect(() => customRange('2026-01-01', '2026-10-09', zone)).toThrow();
    expect(calendarDays('2026-10-08', 'month')).toHaveLength(42);
    expect(moveReference('2026-10-31', 'month', 1)).toBe('2026-11-01');
  });
});

describe('meaningful status and report states remain independent of their visual style', () => {
  it('only flags genuinely open activities older than eight hours', () => {
    const now = new Date('2026-10-09T09:00:00-03:00');
    const old = { startedAt: '2026-10-08T21:00:00-03:00', endedAt: null };
    expect(isOpen(old)).toBe(true);
    expect(isAlertOpen(old, now)).toBe(true);
    expect(
      isAlertOpen({ ...old, endedAt: '2026-10-09T01:00:00-03:00' }, now),
    ).toBe(false);
    expect(isAlertOpen({ startedAt: '2026-10-09T01:00:00-03:00' }, now)).toBe(
      false,
    );
    expect(isAlertOpen({ startedAt: '2026-10-09T10:00:00-03:00' }, now)).toBe(
      false,
    );
    expect(isAlertOpen({ startedAt: 'invalid' }, now)).toBe(false);
  });
  it('treats merged projects as archived and never loses them in archive filters', () => {
    const merged = { mergedInto: 'destination', archived: false };
    expect(archivedProject(merged)).toBe(true);
    expect(matchesArchive(merged, 'active')).toBe(false);
    expect(matchesArchive(merged, 'archived')).toBe(true);
    expect(matchesArchive(merged, 'all')).toBe(true);
    expect(matchesArchive({ archived: false }, 'active')).toBe(true);
  });
  it('does not render misleading chart slices for invalid or zero totals', () => {
    expect(
      pieSlices([
        { label: 'empty', minutes: 0 },
        { label: 'invalid', minutes: NaN },
        { label: 'negative', minutes: -10 },
      ]),
    ).toEqual([]);
    const buckets = [
      { label: 'one', minutes: 60 },
      { label: 'two', minutes: 30 },
    ];
    const slices = pieSlices(buckets);
    expect(slices.map((s) => s.minutes)).toEqual([60, 30]);
    expect(slices.every((s) => !s.full && !s.path.includes('NaN'))).toBe(true);
    expect(pieSlices(buckets.slice(0, 1))[0].full).toBe(true);
    expect(hours(390)).toBe('6,5 h');
  });
  it('fails visibly instead of presenting estimates with incomplete global context', () => {
    const message = reportError({ code: 'functions/resource-exhausted' });
    expect(message).toContain('Nenhuma estimativa foi apresentada');
    expect(message).toContain('reduzir o período não resolve');
    expect(reportError(new Error('internal details'))).not.toContain(
      'internal details',
    );
  });
});

describe('timeline stays mathematically faithful while surfaces change', () => {
  it('collapses only shared internal gaps of four hours or more', () => {
    const items = [
      { start: 0, end: 120 },
      { start: 600, end: 690 },
      { start: 1260, end: 1440 },
    ];
    expect(commonSpan(items)).toEqual({ first: 0, last: 1440 });
    const gaps = commonGaps(items, 0, 1440);
    expect(gaps).toEqual([
      { start: 120, end: 600 },
      { start: 690, end: 1260 },
    ]);
    // A record on ANY visible day blocks compression across that interval.
    expect(commonGaps([...items, { start: 120, end: 600 }], 0, 1440)).toEqual([
      { start: 690, end: 1260 },
    ]);
    expect(
      commonGaps(
        [
          { start: 300, end: 600 },
          { start: 839, end: 900 },
        ],
        0,
        1440,
      ),
    ).toEqual([]);
  });
  it('does not distort activity heights when shared gaps expand', () => {
    const gaps = [
      { start: 120, end: 600 },
      { start: 690, end: 1260 },
    ];
    const folded = axisSegments(0, 1440, gaps, [], 1.1);
    const expanded = axisSegments(0, 1440, gaps, ['120-600'], 1.1);
    expect(folded.filter((s) => s.collapsed).map((s) => s.height)).toEqual([
      32, 32,
    ]);
    const activityHeight = (
      axis: ReturnType<typeof axisSegments>,
      a: number,
      b: number,
    ) => projectMinute(b, axis) - projectMinute(a, axis);
    expect(activityHeight(folded, 600, 660)).toBeCloseTo(66);
    expect(activityHeight(expanded, 600, 660)).toBeCloseTo(66);
    expect(activityHeight(folded, 1260, 1440)).toBeCloseTo(198);
    expect(activityHeight(folded, 600, 605)).toBeCloseTo(5.5);
  });
  it.each([3, 4, 8])(
    'preserves all %i simultaneous events in separate columns',
    (count) => {
      const start = Date.parse('2026-10-08T00:00:00-03:00');
      const items = Array.from({ length: count }, (_, index) => ({
        id: String(index),
        effectiveStartedAt: new Date(start + 8 * 3600000).toISOString(),
        effectiveEndedAt: new Date(start + 11 * 3600000).toISOString(),
      }));
      const result = layoutDay(items, start, start + 86400000);
      expect(result).toHaveLength(count);
      expect(new Set(result.map((event) => event.item.id)).size).toBe(count);
      expect(result.map((event) => event.column)).toEqual(
        Array.from({ length: count }, (_, index) => index),
      );
      expect(
        result.every((event) => event.columns === count && event.overlap),
      ).toBe(true);
      for (const event of result) {
        const left = event.column / event.columns;
        const width = 1 / event.columns;
        expect(width).toBeGreaterThan(0);
        expect(left + width).toBeLessThanOrEqual(1);
      }
    },
  );

  it('separates overlaps but lets touching intervals share a column', () => {
    const start = Date.parse('2026-10-08T00:00:00-03:00');
    const make = (id: string, a: number, b: number) => ({
      id,
      effectiveStartedAt: new Date(start + a * 60000).toISOString(),
      effectiveEndedAt: new Date(start + b * 60000).toISOString(),
    });
    const touching = layoutDay(
      [make('a', 600, 605), make('b', 605, 610)],
      start,
      start + 86400000,
    );
    expect(touching.every((i) => i.columns === 1 && !i.overlap)).toBe(true);
    expect(touching[0].height).toBeCloseTo(5 / 1440);
    const concurrent = layoutDay(
      [make('a', 600, 660), make('b', 630, 690)],
      start,
      start + 86400000,
    );
    expect(concurrent.map((i) => i.column)).toEqual([0, 1]);
    expect(concurrent.every((i) => i.columns === 2 && i.overlap)).toBe(true);
    expect(overlaps(make('a', 600, 605), make('b', 605, 610))).toBe(false);
  });
});
