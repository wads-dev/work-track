import { expect, it } from 'vitest';
import { calendarQueryBounds } from '../../data/sources/calendar-firestore-query';
import {
  globalEstimates,
  recordKey,
} from '@work-track/core/reports/domain/global-estimates';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
it.each([
  'UTC',
  'America/Sao_Paulo',
  'Pacific/Kiritimati',
  'America/Los_Angeles',
])(
  'bounded context preserves clipped intervals and global budgets in %s',
  (zone) => {
    const from = Date.parse('2026-10-08T00:00:00Z'),
      to = Date.parse('2026-10-09T00:00:00Z');
    const { lower, upper } = calendarQueryBounds({
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
    const make = (
      id: string,
      projectId: string,
      startedAt: string,
      endedAt?: string,
      timeZone = zone,
    ): ReportSourceRecord => ({
      id,
      uid: 'a',
      projectId,
      startedAt,
      endedAt,
      timeZone,
      topics: [],
    });
    const full = [
      make('ancient-open', 'p', '2026-01-01T08:00:00Z'),
      make(
        'ancient-closed',
        'p',
        '2026-01-01T08:00:00Z',
        '2026-01-01T09:00:00Z',
      ),
      make(
        'spanning',
        'other',
        '2026-10-01T23:00:00-03:00',
        '2026-10-08T01:00:00-03:00',
      ),
      make('facts', 'other', '2026-10-08T04:00:00Z', '2026-10-08T09:00:00Z'),
      make('open-a', 'p', '2026-10-08T10:00:00+02:00'),
      make('open-b', 'other', '2026-10-08T10:00:00Z'),
      make('short', 'p', '2026-10-08T11:00:00Z', '2026-10-08T11:05:00Z'),
      make('next', 'p', '2026-10-08T12:00:00Z', '2026-10-08T13:00:00Z'),
      make(
        'offset',
        'p',
        '2026-10-09T00:30:00+14:00',
        undefined,
        'Pacific/Kiritimati',
      ),
      make('future', 'p', '2026-12-01T12:00:00Z'),
    ];
    const bounded = full.filter(
      (r) =>
        (r.startedAt >= lower && r.startedAt < upper) ||
        (r.endedAt !== undefined && r.endedAt >= lower && r.startedAt < upper),
    );
    const project = (records: ReportSourceRecord[]) => {
      const ends = globalEstimates(records, to, zone).ends;
      return records
        .flatMap((r) => {
          const start = Math.max(from, Date.parse(r.startedAt)),
            end = Math.min(to, ends.get(recordKey(r))!);
          return end > start ? [[r.id, start, end]] : [];
        })
        .sort();
    };
    expect(bounded.length).toBeLessThan(full.length);
    expect(project(bounded)).toEqual(project(full));
  },
);
