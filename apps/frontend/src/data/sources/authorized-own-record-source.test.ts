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
const catalog = vi.hoisted(() => ({
  call: vi.fn(),
  getFunctions: vi.fn(),
  invalidate: undefined as (() => void) | undefined,
}));
vi.mock('firebase/functions', () => ({
  getFunctions: catalog.getFunctions,
  httpsCallable: () => catalog.call,
}));
vi.mock('../cache/project-repository', () => ({
  projectRepository: {
    load: (
      _owner: unknown,
      _uid: string,
      _scope: string,
      fetch: () => unknown,
    ) => fetch(),
    subscribe: (fn: () => void) => {
      catalog.invalidate = fn;
      return vi.fn();
    },
  },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({
    base: p.join('/'),
    constraints: [],
  }),
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
const app = {};
const db = { app } as Firestore;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const parentSnapshot = (
  data: Record<string, unknown> | undefined,
  cache = false,
) => ({
  exists: () => data !== undefined,
  data: () => data,
  metadata: { fromCache: cache, hasPendingWrites: false },
});
const snapshot = (ids: string[], cache = false) => ({
  docs: ids.map((id) => ({ id, data: () => ({ projectId: 'p' }) })),
  metadata: { fromCache: cache, hasPendingWrites: false },
});
beforeEach(() => {
  listeners.splice(0);
  catalog.call.mockReset().mockResolvedValue({ data: { projects: [] } });
  catalog.getFunctions.mockReset().mockReturnValue({});
  catalog.invalidate = undefined;
});
it('queries explicit authorized catalogs and owner records constrained by project before transfer', async () => {
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
  await flush();
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
it('revokes project rows immediately and ignores late callbacks after disposal', async () => {
  const next = vi.fn();
  const stop = subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  await flush();
  listeners[0].next(snapshot(['p']));
  listeners[1].next(snapshot([]));
  listeners[2].next(snapshot(['x']));
  await flush();
  listeners[0].next(snapshot([]));
  expect(listeners[2].stop).toHaveBeenCalledOnce();
  expect(next.mock.calls.at(-1)?.[0].rows).toEqual([]);
  listeners[2].next(snapshot(['stale']));
  expect(next.mock.calls.at(-1)?.[0].rows).toEqual([]);
  stop();
  const count = next.mock.calls.length;
  await flush();
  listeners[0].next(snapshot(['late']));
  expect(next).toHaveBeenCalledTimes(count);
});
it('propagates errors instead of reporting a confirmed empty count and stops every listener', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, fail);
  await flush();
  listeners[0].next(snapshot(['p']));
  listeners[1].next(snapshot([]));
  listeners[2].error();
  expect(fail).toHaveBeenCalledOnce();
  expect(listeners.every((l) => l.stop.mock.calls.length === 1)).toBe(true);
  const n = next.mock.calls.length;
  listeners[2].next(snapshot(['x']));
  expect(next).toHaveBeenCalledTimes(n);
});
it('retains provisional metadata from either catalog or owner branch', async () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  await flush();
  listeners[0].next(snapshot(['p'], true));
  listeners[1].next(snapshot([]));
  listeners[2].next(snapshot(['x']));
  expect(next.mock.calls.at(-1)?.[0].fromCache).toBe(true);
});

it('discovers legacy projects across catalog pages and waits for current parent authorization', async () => {
  catalog.call
    .mockResolvedValueOnce({
      data: { projects: [{ id: 'old' }], nextCursor: 'page2' },
    })
    .mockResolvedValueOnce({
      data: { projects: [{ id: 'typed', type: 'work' }] },
    });
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, fail, {
    size: 2,
    after: 'a',
  });
  listeners[0].next(snapshot([]));
  listeners[1].next(snapshot([]));
  expect(next).not.toHaveBeenCalled();
  await flush();
  expect(catalog.getFunctions).toHaveBeenCalledWith(app, 'southamerica-east1');
  expect(catalog.call).toHaveBeenNthCalledWith(2, {
    scope: 'all',
    limit: 100,
    includeArchived: true,
    cursor: 'page2',
  });
  expect(listeners[2].q.base).toBe('projects/old');
  expect(next).not.toHaveBeenCalled();
  listeners[2].next(parentSnapshot({}, true));
  expect(listeners[3].q.base).toBe('users/alice/records');
  expect(listeners[3].q.constraints).toContainEqual([
    'where',
    'projectId',
    '==',
    'old',
  ]);
  expect(listeners[3].q.constraints).toContainEqual(['limit', 2]);
  listeners[3].next(snapshot(['b']));
  expect(next.mock.calls.at(-1)?.[0]).toMatchObject({
    rows: [{ id: 'b' }],
    fromCache: true,
  });
  listeners[2].next(parentSnapshot({ type: 'personal', createdBy: 'bob' }));
  expect(listeners[3].stop).toHaveBeenCalledOnce();
  expect(next.mock.calls.at(-1)?.[0].rows).toEqual([]);
  listeners[3].next(snapshot(['late']));
  expect(next.mock.calls.at(-1)?.[0].rows).toEqual([]);
  expect(fail).not.toHaveBeenCalled();
});
it('fails closed on catalog errors including backend catalog limits', async () => {
  catalog.call.mockRejectedValue(Error('Catálogo excede 1000 projetos'));
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, fail);
  listeners[0].next(snapshot([]));
  listeners[1].next(snapshot([]));
  await flush();
  expect(fail).toHaveBeenCalledOnce();
  expect(next).not.toHaveBeenCalled();
  expect(listeners.every((l) => l.stop.mock.calls.length === 1)).toBe(true);
});
it('ignores catalog results after disposal and superseded invalidation', async () => {
  let resolve!: (value: unknown) => void;
  catalog.call.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const next = vi.fn(),
    fail = vi.fn();
  const stop = subscribeAuthorizedOwnRecords(db, 'alice', next, fail);
  catalog.invalidate!();
  await flush();
  resolve({ data: { projects: [{ id: 'late' }] } });
  await flush();
  expect(listeners).toHaveLength(2);
  stop();
  catalog.call.mockResolvedValue({ data: { projects: [{ id: 'another' }] } });
  catalog.invalidate!();
  await flush();
  expect(listeners).toHaveLength(2);
  expect(fail).not.toHaveBeenCalled();
});

it('fails closed on legacy parent errors and ignores errors from superseded parents', async () => {
  catalog.call.mockResolvedValue({ data: { projects: [{ id: 'legacy' }] } });
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, fail);
  listeners[0].next(snapshot([]));
  listeners[1].next(snapshot([]));
  await flush();
  const oldParent = listeners[2];
  catalog.invalidate!();
  await flush();
  oldParent.error();
  expect(fail).not.toHaveBeenCalled();
  const currentParent = listeners.at(-1)!;
  currentParent.error();
  expect(fail).toHaveBeenCalledOnce();
  expect(currentParent.stop).toHaveBeenCalledOnce();
  const count = next.mock.calls.length;
  currentParent.next(parentSnapshot({}));
  expect(next).toHaveBeenCalledTimes(count);
});
