import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  listeners: [] as {
    target: { path: string; constraints: unknown[] };
    options: { source: 'cache' | 'default'; includeMetadataChanges: boolean };
    next: (snapshot: unknown) => void;
    error: () => void;
    stop: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('../cache/project-access-revision', () => ({
  invalidateProjectAccess: mocks.access,
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => path,
  doc: (_db: unknown, path: string, id: string) => ({
    path: path + '/' + id,
    constraints: [],
  }),
  query: (path: string, ...constraints: unknown[]) => ({ path, constraints }),
  where: (...args: unknown[]) => args,
  onSnapshot: (
    target: { path: string; constraints: unknown[] },
    options: { source: 'cache' | 'default'; includeMetadataChanges: boolean },
    next: (snapshot: unknown) => void,
    error: () => void,
  ) => {
    const stop = vi.fn();
    mocks.listeners.push({ target, options, next, error, stop });
    return stop;
  },
}));
import { subscribeAuthorizedProjects } from './authorized-project-source';
const db = {} as Firestore;
const batch = (
  documents: [string, Record<string, unknown>][],
  cache = true,
  pending = false,
) => ({
  docs: documents.map(([id, data]) => ({ id, data: () => data })),
  metadata: { fromCache: cache, hasPendingWrites: pending },
});
beforeEach(() => {
  mocks.listeners.splice(0);
  mocks.access.mockReset();
});
it('reads scoped cache first and keeps a default listener for remote synchronization', () => {
  const next = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, vi.fn());
  expect(mocks.listeners.map((l) => l.options.source)).toEqual([
    'cache',
    'default',
    'cache',
    'default',
  ]);
  expect(mocks.listeners.every((l) => l.options.includeMetadataChanges)).toBe(
    true,
  );
  expect(mocks.listeners[0].target.constraints).toEqual([
    ['type', '==', 'work'],
  ]);
  expect(mocks.listeners[2].target.constraints).toEqual([
    ['type', '==', 'personal'],
    ['createdBy', '==', 'alice'],
  ]);
  mocks.listeners[0].next(batch([['work', { type: 'work', title: 'cached' }]]));
  mocks.listeners[2].next(batch([]));
  expect(next.mock.lastCall?.[0]).toMatchObject({
    rows: [],
    fromCache: true,
    complete: false,
  });
  mocks.listeners[1].next(
    batch([['work', { type: 'work', title: 'current' }]], false),
  );
  mocks.listeners[3].next(batch([], false));
  expect(next.mock.lastCall?.[0]).toMatchObject({
    rows: [{ id: 'work', data: { title: 'current' } }],
    fromCache: false,
    complete: true,
  });
  const calls = next.mock.calls.length;
  mocks.listeners[0].next(batch([['old', { type: 'work' }]]));
  expect(next).toHaveBeenCalledTimes(calls);
});
it('applies server create update delete and revocation instead of retaining stale Promise data', () => {
  const next = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, vi.fn());
  mocks.listeners[1].next(
    batch([['p', { type: 'work', title: 'before' }]], false),
  );
  mocks.listeners[3].next(
    batch([['own', { type: 'personal', createdBy: 'alice' }]], false),
  );
  mocks.listeners[1].next(
    batch(
      [
        ['p', { type: 'work', title: 'after' }],
        ['new', { type: 'work' }],
      ],
      false,
    ),
  );
  expect(next.mock.lastCall?.[0].rows.map((r: { id: string }) => r.id)).toEqual(
    ['new', 'own', 'p'],
  );
  expect(next.mock.lastCall?.[0].rows[2].data.title).toBe('after');
  mocks.listeners[3].next(batch([], false));
  expect(next.mock.lastCall?.[0].rows.map((r: { id: string }) => r.id)).toEqual(
    ['new', 'p'],
  );
  mocks.listeners[1].next(batch([], false));
  expect(next.mock.lastCall?.[0]).toMatchObject({ rows: [], complete: true });
  expect(mocks.access).toHaveBeenCalled();
});
it('checks ownership even on cached results and treats pending metadata as provisional', () => {
  const next = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, vi.fn());
  mocks.listeners[1].next(batch([['invalid', { type: null }]], false));
  mocks.listeners[3].next(
    batch(
      [
        ['foreign', { type: 'personal', createdBy: 'bob' }],
        ['own', { type: 'personal', createdBy: 'alice' }],
      ],
      false,
      true,
    ),
  );
  expect(next.mock.lastCall?.[0]).toMatchObject({
    rows: [],
    fromCache: false,
    hasPendingWrites: true,
    complete: false,
  });
});
it('does not let metadata-only emissions invalidate completed calculations', () => {
  const next = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, vi.fn());
  mocks.listeners[0].next(batch([['p', { type: 'work' }]]));
  mocks.listeners[2].next(batch([]));
  mocks.access.mockClear();
  mocks.listeners[1].next(batch([['p', { type: 'work' }]], false));
  mocks.listeners[3].next(batch([], false));
  mocks.access.mockClear();
  mocks.listeners[1].next(batch([['p', { type: 'work' }]], false));
  mocks.listeners[3].next(batch([], false));
  expect(mocks.access).not.toHaveBeenCalled();
  expect(next.mock.lastCall?.[0].complete).toBe(true);
});
it('fails closed when a remote listener loses permission and detaches every branch', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, fail);
  mocks.listeners[0].next(batch([['cached', { type: 'work' }]]));
  mocks.listeners[2].next(batch([]));
  mocks.listeners[1].error();
  expect(fail).toHaveBeenCalledOnce();
  expect(
    mocks.listeners.every((listener) => listener.stop.mock.calls.length === 1),
  ).toBe(true);
  const calls = next.mock.calls.length;
  mocks.listeners[3].next(
    batch([['late', { type: 'personal', createdBy: 'alice' }]], false),
  );
  expect(next).toHaveBeenCalledTimes(calls);
  expect(mocks.access).toHaveBeenCalled();
});
it('ignores late callbacks after account disposal and does not reconnect for logged-out callers', () => {
  const next = vi.fn();
  const stop = subscribeAuthorizedProjects(db, 'alice', next, vi.fn());
  stop();
  stop();
  mocks.listeners[1].next(batch([['old-account', { type: 'work' }]], false));
  expect(next).not.toHaveBeenCalled();
  expect(
    mocks.listeners.every((listener) => listener.stop.mock.calls.length === 1),
  ).toBe(true);
  mocks.listeners.splice(0);
  subscribeAuthorizedProjects(db, '', next, vi.fn());
  expect(mocks.listeners).toHaveLength(0);
  expect(next).toHaveBeenLastCalledWith({
    rows: [],
    fromCache: true,
    hasPendingWrites: false,
    complete: false,
  });
});
it('a fresh subscription recovers after a failed authorization and never inherits the old rows', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, fail);
  mocks.listeners[1].error();
  const second = vi.fn();
  const start = mocks.listeners.length;
  subscribeAuthorizedProjects(db, 'alice', second, vi.fn());
  mocks.listeners[start].next(batch([['stale', { type: 'work' }]]));
  mocks.listeners[start + 2].next(batch([]));
  expect(second.mock.lastCall?.[0].rows).toEqual([]);
  mocks.listeners[start + 1].next(batch([['fresh', { type: 'work' }]], false));
  mocks.listeners[start + 3].next(batch([], false));
  expect(second.mock.lastCall?.[0]).toMatchObject({
    rows: [{ id: 'fresh' }],
    complete: true,
  });
});
it('never marks an empty cold cache as a complete empty catalog', () => {
  const next = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, vi.fn());
  mocks.listeners[0].next(batch([]));
  mocks.listeners[2].next(batch([]));
  expect(next).toHaveBeenLastCalledWith({
    rows: [],
    fromCache: true,
    hasPendingWrites: false,
    complete: false,
  });
  mocks.listeners[1].next(batch([], false));
  mocks.listeners[3].next(batch([], false));
  expect(next).toHaveBeenLastCalledWith({
    rows: [],
    fromCache: false,
    hasPendingWrites: false,
    complete: true,
  });
});
