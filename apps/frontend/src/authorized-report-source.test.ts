import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
interface MockDoc {
  id: string;
  ref?: { path: string };
  data(): Record<string, unknown>;
}
type MockSnapshot = {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
} & (
  { docs: MockDoc[] } | { exists(): boolean; data(): Record<string, unknown> }
);
interface MockQuery {
  base: unknown;
  constraints: unknown[];
}
const mock = vi.hoisted(() => ({
  listeners: [] as {
    q: unknown;
    next: (s: MockSnapshot) => void;
    fail: (e: Error) => void;
    stop: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('firebase/firestore', () => ({
  collection: (_d: unknown, p: string) => ({ path: p }),
  collectionGroup: (_d: unknown, p: string) => ({ group: p }),
  doc: (_d: unknown, p: string, id: string) => ({ path: p + '/' + id }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (base: unknown, ...constraints: unknown[]) => ({ base, constraints }),
  onSnapshot: (
    q: unknown,
    _o: unknown,
    next: (s: MockSnapshot) => void,
    fail: (e: Error) => void,
  ) => {
    const stop = vi.fn();
    mock.listeners.push({ q, next, fail, stop });
    return stop;
  },
}));
import {
  authorizedRecordQueries,
  subscribeAuthorizedReport,
} from './authorized-report-source';
const db = {} as Firestore;
const range = {
  from: '2026-10-08T00:00:00Z',
  to: '2026-10-09T00:00:00Z',
  projectId: 'a',
};
const fact = {
  uid: 'alice',
  projectId: 'a',
  startedAt: '2026-10-08T12:00:00Z',
  endedAt: '2026-10-08T13:00:00Z',
  timeZone: 'UTC',
  topics: [],
};
const record = (data = fact) => ({
  id: 'r',
  ref: { path: 'users/alice/records/r' },
  data: () => data,
});
const batch = (docs: MockDoc[], cache = false, pending = false) => ({
  docs,
  metadata: { fromCache: cache, hasPendingWrites: pending },
});
const catalog = (rows: [string, Record<string, unknown>][]) =>
  batch(rows.map(([id, data]) => ({ id, data: () => data })));
beforeEach(() => (mock.listeners.length = 0));
it('puts project and temporal bounds into both selection queries before snapshots transfer', () => {
  const q = authorizedRecordQueries(db, 'a', range) as unknown as MockQuery[];
  expect(q).toHaveLength(2);
  for (const x of q) {
    expect(x.base).toEqual({ group: 'records' });
    expect(x.constraints).toContainEqual({
      field: 'projectId',
      op: '==',
      value: 'a',
    });
    expect(x.constraints).toContainEqual({
      field: 'startedAt',
      op: '<',
      value: '2026-10-11',
    });
  }
  expect(q[0].constraints).toContainEqual({
    field: 'startedAt',
    op: '>=',
    value: '2026-10-06',
  });
  expect(q[1].constraints).toContainEqual({
    field: 'endedAt',
    op: '>=',
    value: '2026-10-06',
  });
});
it('waits for full context and both branches, marks cache provisional and disposes auth-scoped listeners', async () => {
  const next = vi.fn(),
    fail = vi.fn(),
    stop = subscribeAuthorizedReport(db, 'viewer', next, fail, [], range);
  mock.listeners[0].next(catalog([['a', { type: 'work', topics: [] }]]));
  mock.listeners[1].next(catalog([]));
  expect(mock.listeners).toHaveLength(5);
  mock.listeners[2].next(batch([record()]));
  mock.listeners[3].next(batch([record()], true));
  expect(next).not.toHaveBeenCalled();
  mock.listeners[4].next(batch([record()]));
  expect(next.mock.lastCall![0]).toMatchObject({
    coherent: true,
    fromCache: true,
  });
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toHaveLength(1);
  stop();
  for (const l of mock.listeners) expect(l.stop).toHaveBeenCalledOnce();
  const count = next.mock.calls.length;
  mock.listeners[4].next(batch([]));
  expect(next).toHaveBeenCalledTimes(count);
});
it('retains immutable calculation during divergent updates and removes revoked parents immediately', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail, [], range);
  mock.listeners[0].next(catalog([['a', { type: 'work', topics: [] }]]));
  mock.listeners[1].next(catalog([]));
  for (let i = 2; i < 5; i++) mock.listeners[i].next(batch([record()]));
  const previous = next.mock.lastCall![0].repository;
  mock.listeners[3].next(
    batch([record({ ...fact, endedAt: '2026-10-08T14:00:00Z' })]),
  );
  expect(next.mock.lastCall![0].coherent).toBe(false);
  expect(next.mock.lastCall![0].repository).toBe(previous);
  mock.listeners[0].next(catalog([]));
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  for (let i = 2; i < 5; i++)
    expect(mock.listeners[i].stop).toHaveBeenCalledOnce();
});
it('clears listener lifecycle on permission errors instead of serving old records', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  mock.listeners[0].fail(new Error('permission-denied'));
  expect(fail).toHaveBeenCalledOnce();
  for (const l of mock.listeners) expect(l.stop).toHaveBeenCalledOnce();
  mock.listeners[1].next(catalog([]));
  expect(next).not.toHaveBeenCalled();
});
it('includes legacy catalog parents, waits for snapshots and deduplicates IDs', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail, ['legacy', 'legacy']);
  expect(mock.listeners).toHaveLength(3);
  mock.listeners[0].next(catalog([]));
  mock.listeners[1].next(catalog([]));
  expect(next).not.toHaveBeenCalled();
  mock.listeners[2].next({
    exists: () => true,
    data: () => ({ topics: [] }),
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  expect(mock.listeners).toHaveLength(4);
  expect(next).not.toHaveBeenCalled();
  mock.listeners[3].next(batch([record({ ...fact, projectId: 'legacy' })]));
  expect(next.mock.lastCall![0].coherent).toBe(true);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toHaveLength(1);
});
it('explicit parent revocation overrides stale work catalog regardless callback order', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail, ['a']);
  const parent = (data: Record<string, unknown>) => ({
    exists: () => true,
    data: () => data,
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  mock.listeners[2].next(parent({ type: 'work', topics: [] }));
  mock.listeners[0].next(catalog([['a', { type: 'work', topics: [] }]]));
  mock.listeners[1].next(catalog([]));
  mock.listeners[3].next(batch([record()]));
  mock.listeners[2].next(
    parent({ type: 'personal', createdBy: 'other', topics: [] }),
  );
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  expect(mock.listeners[3].stop).toHaveBeenCalledOnce();
  mock.listeners[0].next(catalog([['a', { type: 'work', topics: [] }]]));
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
});
