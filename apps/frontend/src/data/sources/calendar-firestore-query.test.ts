import { beforeEach, expect, it, vi } from 'vitest';
import {
  nativeCache,
  row,
  type CacheQuery,
} from '../repositories/firestore-report-fixture';
vi.mock(
  'firebase/firestore',
  async () =>
    (await import('../repositories/firestore-report-fixture')).nativeCache
      .firestore,
);
import {
  calendarQueryBounds,
  calendarRecordQueries,
} from './calendar-firestore-query';
beforeEach(() => nativeCache.reset());
const range = {
  from: '2026-10-09T00:00:00-03:00',
  to: '2026-10-10T00:00:00-03:00',
  projectId: 'p',
};
it('pushes owner, project and temporal predicates into independent native query branches', () => {
  const queries = calendarRecordQueries(
    nativeCache.db,
    'alice',
    range,
  ) as unknown as CacheQuery[];
  expect(queries).toHaveLength(3);
  for (const q of queries) {
    expect(q.base).toBe('users/alice/records');
    expect(q.constraints[0]).toEqual({
      field: 'projectId',
      op: '==',
      value: 'p',
    });
  }
  expect(queries[0].constraints.map((c) => c.field)).toEqual([
    'projectId',
    'startedAt',
    'startedAt',
  ]);
  expect(queries[1].constraints.map((c) => c.field)).toEqual([
    'projectId',
    'endedAt',
    'startedAt',
  ]);
});
it('keeps all projects in bounded context and pads offset ISO boundaries', () => {
  expect(calendarQueryBounds(range)).toEqual({
    lower: '2026-10-07',
    upper: '2026-10-12',
  });
  const queries = calendarRecordQueries(
    nativeCache.db,
    'alice',
    range,
    true,
  ) as unknown as CacheQuery[];
  for (const q of queries)
    expect(q.constraints.some((c) => c.field === 'projectId')).toBe(false);
});
it('rejects invalid interval and owner path injection', () => {
  expect(() => calendarRecordQueries(nativeCache.db, 'a/b', range)).toThrow();
  expect(() => calendarQueryBounds({ ...range, to: range.from })).toThrow();
});

it('native owner-scoped branches include spanning intervals and offset starts without leaking another owner or project', () => {
  nativeCache.seed([
    row('spanning', {
      startedAt: '2026-09-01T00:00:00Z',
      endedAt: '2026-11-01T00:00:00Z',
    }),
    row('offset', { startedAt: '2026-10-08T23:00:00-03:00' }),
    row('null-open', { startedAt: '2026-10-09T12:00:00Z', endedAt: null }),
    row('other-project', { projectId: 'q', startedAt: '2026-10-09T12:00:00Z' }),
    row('other-owner', { startedAt: '2026-10-09T12:00:00Z' }, 'bob'),
    row('old-missing', { startedAt: '2026-01-01T00:00:00Z' }),
    row('old-closed', {
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-02T00:00:00Z',
    }),
  ]);
  const branches = calendarRecordQueries(
    nativeCache.db,
    'alice',
    range,
  ) as unknown as CacheQuery[];
  const found = new Set(
    branches.flatMap((q) => nativeCache.evaluate(q).docs.map((doc) => doc.id)),
  );
  expect([...found].sort()).toEqual([
    'null-open',
    'offset',
    'old-closed',
    'old-missing',
    'spanning',
  ]);
  // Old closed candidates require the repository open-only residual on branch3.
  expect(branches[2].constraints).toContainEqual({
    field: 'startedAt',
    op: '<',
    value: calendarQueryBounds(range).lower,
  });
  expect(nativeCache.getDocs).not.toHaveBeenCalled();
  expect(nativeCache.onSnapshot).not.toHaveBeenCalled();
});

it('clamps year9999 upper envelopes to lexical sentinel rather than dropping valid facts', () => {
  expect(
    calendarQueryBounds({
      from: '9999-12-29T00:00:00Z',
      to: '9999-12-31T00:00:00Z',
    }).upper,
  ).toBe('\uf8ff');
});
