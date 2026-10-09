import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const listeners = vi.hoisted(
  () =>
    [] as {
      q: { base: string; constraints: unknown[] };
      next: (s: unknown) => void;
      error: () => void;
      stop: ReturnType<typeof vi.fn>;
    }[],
);
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...p: string[]) => p.join('/'),
  query: (base: string, ...constraints: unknown[]) => ({ base, constraints }),
  where: (...args: unknown[]) => ['where', ...args],
  orderBy: (v: unknown) => ['orderBy', v],
  documentId: () => '__name__',
  startAfter: (v: unknown) => ['after', v],
  limit: (n: number) => ['limit', n],
  onSnapshot: (
    q: { base: string; constraints: unknown[] },
    _options: unknown,
    next: (s: unknown) => void,
    error: () => void,
  ) => {
    const stop = vi.fn();
    listeners.push({ q, next, error, stop });
    return stop;
  },
}));
import { subscribeAuthorizedOwnRecords } from './authorized-own-record-source';
const db = {} as Firestore;
const snapshot = (ids: string[], cache = false) => ({
  docs: ids.map((id) => ({ id, data: () => ({ projectId: 'p' }) })),
  metadata: { fromCache: cache, hasPendingWrites: false },
});
beforeEach(() => listeners.splice(0));
it('queries explicit authorized catalogs and owner records constrained by project before transfer', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn(), {
    size: 2,
    after: 'a',
  });
  expect(listeners[0].q.constraints).toContainEqual([
    'where',
    'type',
    '==',
    'work',
  ]);
  expect(listeners[1].q.constraints).toContainEqual([
    'where',
    'createdBy',
    '==',
    'alice',
  ]);
  listeners[0].next(snapshot(['p']));
  listeners[1].next(snapshot(['private']));
  expect(listeners).toHaveLength(4);
  for (const l of listeners.slice(2)) {
    expect(l.q.base).toBe('users/alice/records');
    expect(l.q.constraints).toContainEqual([
      'where',
      'projectId',
      '==',
      l === listeners[2] ? 'p' : 'private',
    ]);
    expect(l.q.constraints).toContainEqual(['limit', 2]);
    expect(l.q.constraints).toContainEqual(['after', 'a']);
  }
  listeners[2].next(snapshot(['b', 'd']));
  listeners[3].next(snapshot(['c', 'e']));
  expect(next.mock.calls.at(-1)?.[0]).toMatchObject({
    rows: [{ id: 'b' }, { id: 'c' }],
    cursor: 'c',
    hasMore: true,
    fromCache: false,
  });
});
it('revokes project rows immediately and ignores late callbacks after disposal', () => {
  const next = vi.fn();
  const stop = subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  listeners[0].next(snapshot(['p']));
  listeners[1].next(snapshot([]));
  listeners[2].next(snapshot(['x']));
  listeners[0].next(snapshot([]));
  expect(listeners[2].stop).toHaveBeenCalledOnce();
  expect(next.mock.calls.at(-1)?.[0].rows).toEqual([]);
  listeners[2].next(snapshot(['stale']));
  expect(next.mock.calls.at(-1)?.[0].rows).toEqual([]);
  stop();
  const count = next.mock.calls.length;
  listeners[0].next(snapshot(['late']));
  expect(next).toHaveBeenCalledTimes(count);
});
it('propagates errors instead of reporting a confirmed empty count and stops every listener', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, fail);
  listeners[0].next(snapshot(['p']));
  listeners[1].next(snapshot([]));
  listeners[2].error();
  expect(fail).toHaveBeenCalledOnce();
  expect(listeners.every((l) => l.stop.mock.calls.length === 1)).toBe(true);
  const n = next.mock.calls.length;
  listeners[2].next(snapshot(['x']));
  expect(next).toHaveBeenCalledTimes(n);
});
it('retains provisional metadata from either catalog or owner branch', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  listeners[0].next(snapshot(['p'], true));
  listeners[1].next(snapshot([]));
  listeners[2].next(snapshot(['x']));
  expect(next.mock.calls.at(-1)?.[0].fromCache).toBe(true);
});
