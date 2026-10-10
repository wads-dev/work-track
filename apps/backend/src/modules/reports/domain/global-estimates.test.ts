import { expect, it } from 'vitest';
import { globalEstimates, recordKey } from './global-estimates.js';
import { buildProjectReport } from './build-project-report.js';
import { buildPersonalReport } from './build-personal-report.js';
import type { ReportSourceRecord } from './project-report.js';
const make = (
  id: string,
  hour: number,
  projectId = id,
  endedAt?: string,
): ReportSourceRecord => ({
  id,
  uid: 'alice',
  projectId,
  startedAt: '2026-10-08T' + String(hour).padStart(2, '0') + ':00:00-03:00',
  ...(endedAt ? { endedAt } : {}),
  timeZone: 'America/Sao_Paulo',
  topics: [],
});
const now = Date.parse('2026-10-09T00:00:00-03:00');
it('estimates six hours independently across projects and pages without a daily cap', () => {
  const all = [make('a', 4), make('b', 8), make('c', 12), make('d', 16)],
    global = globalEstimates(all, now);
  expect(
    all.map(
      (r) => (global.ends.get(recordKey(r))! - Date.parse(r.startedAt)) / 60000,
    ),
  ).toEqual([360, 360, 360, 360]);
  for (const r of all) {
    const page = buildProjectReport(
      r.projectId,
      { records: [r], nextCursor: 'next', topicLabels: {} },
      1,
      now,
      {},
      true,
      all,
    );
    expect(page.records[0]?.effectiveEndedAt).toBe(
      new Date(global.ends.get(recordKey(r))!).toISOString(),
    );
  }
});
it('closed facts do not consume open estimates even beyond eight hours', () => {
  const fact = make('fact', 4, 'other', '2026-10-08T10:00:00-03:00'),
    open = make('open', 11);
  expect(globalEstimates([fact, open], now).ends.get(recordKey(open))).toBe(
    Date.parse('2026-10-08T17:00:00-03:00'),
  );
  const long = { ...fact, endedAt: '2026-10-08T14:00:00-03:00' };
  const result = globalEstimates([long, open], now);
  expect(result.ends.get(recordKey(long))).toBe(Date.parse(long.endedAt));
  expect(result.ends.get(recordKey(open))).toBe(
    Date.parse('2026-10-08T17:00:00-03:00'),
  );
});
it('next outside selected page and timezone filters cannot change estimated ends', () => {
  const all = [make('a', 4), make('b', 5, 'a')],
    project = buildProjectReport(
      'a',
      { records: [all[0]!], topicLabels: {}, nextCursor: null },
      1,
      now,
      {},
      false,
      all,
    );
  for (const zone of ['UTC', 'America/Sao_Paulo', 'America/New_York']) {
    const personal = buildPersonalReport(
      {
        from: '2026-10-08T00:00:00-03:00',
        to: '2026-10-09T00:00:00-03:00',
        timeZone: zone,
      },
      { records: [all[0]!], scannedCount: 1, nextCursor: null },
      now,
      all,
    );
    expect(personal.intervals[0]?.effectiveEndedAt).toBe(
      project.records[0]?.effectiveEndedAt,
    );
    expect(personal.totalMinutes).toBe(60);
  }
});
it('preserves now and future starts without mutating source records', () => {
  const open = make('open', 9),
    future = make('future', 12, 'other');
  const records = [open, future];
  const before = structuredClone(records);
  const result = globalEstimates(
    records,
    Date.parse('2026-10-08T10:30:00-03:00'),
  );
  expect(result.ends.get(recordKey(open))).toBe(
    Date.parse('2026-10-08T10:30:00-03:00'),
  );
  expect(result.ends.get(recordKey(future))).toBe(Date.parse(future.startedAt));
  expect(records).toEqual(before);
  expect(open).not.toHaveProperty('endedAt');
});
it('ignores closed cuts below fifteen minutes but cuts at exactly fifteen minutes', () => {
  const open = make('open', 9, 'a');
  const tiny = make('tiny', 10, 'a', '2026-10-08T10:14:59-03:00');
  const next = make('next', 13, 'a', '2026-10-08T13:15:00-03:00');
  const otherUser = { ...make('foreign', 11, 'a'), uid: 'bob' };
  const result = globalEstimates([open, tiny, otherUser, next], now);
  expect(result.ends.get(recordKey(open))).toBe(Date.parse(next.startedAt));
  expect(result.ends.get(recordKey(tiny))).toBe(Date.parse(tiny.endedAt!));
});
it('preserves record and canonical midnight limits with mixed time zones', () => {
  const open = make('open', 22);
  expect(globalEstimates([open], now).ends.get(recordKey(open))).toBe(now);
  const mixed = { ...make('mixed', 9), timeZone: 'Asia/Tokyo' };
  expect(globalEstimates([mixed], now).ends.get(recordKey(mixed))).toBe(
    Date.parse('2026-10-08T15:00:00Z'),
  );
  const canonical = {
    ...make('canonical', 22),
    timeZone: 'America/Los_Angeles',
  };
  expect(globalEstimates([canonical], now).ends.get(recordKey(canonical))).toBe(
    now,
  );
});
it('fails closed when selected record is missing or changed in context', () => {
  const record = make('a', 4);
  expect(() =>
    buildProjectReport(
      'a',
      { records: [record], topicLabels: {}, nextCursor: null },
      1,
      now,
      {},
      false,
      [],
    ),
  ).toThrow('Página mudou');
  expect(() =>
    buildPersonalReport(
      {
        from: '2026-10-08T00:00:00-03:00',
        to: '2026-10-09T00:00:00-03:00',
        timeZone: 'UTC',
      },
      { records: [record], scannedCount: 1, nextCursor: null },
      now,
      [{ ...record, endedAt: '2026-10-08T06:00:00-03:00' }],
    ),
  ).toThrow('Página mudou');
});
