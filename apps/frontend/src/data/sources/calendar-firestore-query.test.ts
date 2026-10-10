import { expect, it, vi } from 'vitest';
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  where: (field: string, op: string, value: string) => ({ field, op, value }),
  query: (path: string, ...clauses: unknown[]) => ({ path, clauses }),
}));
import type { Firestore } from 'firebase/firestore';
import {
  calendarQueryBounds,
  calendarRecordQueries,
} from './calendar-firestore-query';
interface MockClause {
  field: string;
  op: string;
  value: string;
}
interface MockQuery {
  path: string;
  clauses: MockClause[];
}
const range = {
  from: '2026-10-09T00:00:00-03:00',
  to: '2026-10-10T00:00:00-03:00',
  projectId: 'p',
};
it('pushes owner, project and temporal predicates into two independent queries', () => {
  const queries = calendarRecordQueries(
    {} as Firestore,
    'alice',
    range,
  ) as unknown as MockQuery[];
  expect(queries).toHaveLength(2);
  for (const q of queries) {
    expect(q.path).toBe('users/alice/records');
    expect(q.clauses[0]).toEqual({ field: 'projectId', op: '==', value: 'p' });
  }
  expect(queries[0].clauses.map((c) => c.field)).toEqual([
    'projectId',
    'startedAt',
    'startedAt',
  ]);
  expect(queries[1].clauses.map((c) => c.field)).toEqual([
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
    {} as Firestore,
    'alice',
    range,
    true,
  ) as unknown as MockQuery[];
  for (const q of queries)
    expect(q.clauses.some((c) => c.field === 'projectId')).toBe(false);
});
it('rejects invalid interval and owner path injection', () => {
  expect(() => calendarRecordQueries({} as Firestore, 'a/b', range)).toThrow();
  expect(() => calendarQueryBounds({ ...range, to: range.from })).toThrow();
});
