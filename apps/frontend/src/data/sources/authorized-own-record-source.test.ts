import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import type { ProjectSnapshot } from './authorized-project-source';
const mocks = vi.hoisted(() => ({
  catalogNext: undefined as ((snapshot: ProjectSnapshot) => void) | undefined,
  catalogError: undefined as (() => void) | undefined,
  catalogStop: vi.fn(),
  listeners: [] as {
    q: { base: string; constraints: unknown[][] };
    options: { includeMetadataChanges: boolean };
    next: (snapshot: unknown) => void;
    error: () => void;
    stop: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('./authorized-project-source', () => ({
  subscribeAuthorizedProjects: (
    _db: unknown,
    _uid: string,
    next: (s: ProjectSnapshot) => void,
    error: () => void,
  ) => {
    mocks.catalogNext = next;
    mocks.catalogError = error;
    return mocks.catalogStop;
  },
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  query: (base: string, ...constraints: unknown[][]) => ({ base, constraints }),
  where: (...args: unknown[]) => ['where', ...args],
  orderBy: (...args: unknown[]) => ['orderBy', ...args],
  documentId: () => '__name__',
  startAfter: (id: string) => ['after', id],
  limit: (n: number) => ['limit', n],
  onSnapshot: (
    q: { base: string; constraints: unknown[][] },
    options: { includeMetadataChanges: boolean },
    next: (s: unknown) => void,
    error: () => void,
  ) => {
    const stop = vi.fn();
    mocks.listeners.push({ q, options, next, error, stop });
    return stop;
  },
}));
import { subscribeAuthorizedOwnRecords } from './authorized-own-record-source';
const db = {} as Firestore;
const catalog = (ids: string[], cache = false): ProjectSnapshot => ({
  rows: ids.map((id) => ({ id, data: { type: 'work' } })),
  fromCache: cache,
  hasPendingWrites: false,
  complete: !cache,
});
const records = (
  rows: [string, Record<string, unknown>][],
  cache = false,
  pending = false,
) => ({
  docs: rows.map(([id, data]) => ({ id, data: () => data })),
  metadata: { fromCache: cache, hasPendingWrites: pending },
});
beforeEach(() => {
  mocks.listeners.splice(0);
  mocks.catalogNext = undefined;
  mocks.catalogError = undefined;
  mocks.catalogStop.mockReset();
});
it('does not confirm a provisional empty catalog as an empty history', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  mocks.catalogNext!(catalog([], true));
  expect(next).not.toHaveBeenCalled();
  expect(mocks.listeners).toHaveLength(0);
  mocks.catalogNext!(catalog(['p']));
  mocks.listeners[0].next(records([['real', { projectId: 'p' }]]));
  expect(
    next.mock.lastCall?.[0].rows.map((row: { id: string }) => row.id),
  ).toEqual(['real']);
});
it('subscribes only to authorized project-scoped owner queries, never an unfiltered scan', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  mocks.catalogNext!(catalog(['p']));
  expect(mocks.listeners[0].q).toEqual({
    base: 'users/alice/records',
    constraints: [
      ['where', 'projectId', '==', 'p'],
      ['orderBy', '__name__'],
    ],
  });
  expect(mocks.listeners[0].options.includeMetadataChanges).toBe(true);
  mocks.listeners[0].next(records([['r', { projectId: 'p' }]]));
  expect(next).toHaveBeenLastCalledWith({
    rows: [{ id: 'r', data: { projectId: 'p' } }],
    fromCache: false,
    hasMore: false,
    cursor: 'r',
  });
});
it('revocation immediately removes old rows and prevents late snapshots from restoring them', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, fail);
  mocks.catalogNext!(catalog(['p']));
  const old = mocks.listeners[0];
  old.next(records([['private', { projectId: 'p' }]]));
  mocks.catalogNext!(catalog([]));
  expect(old.stop).toHaveBeenCalledOnce();
  expect(next.mock.lastCall?.[0].rows).toEqual([]);
  old.next(records([['late', { projectId: 'p' }]]));
  old.error();
  expect(next.mock.lastCall?.[0].rows).toEqual([]);
  expect(fail).not.toHaveBeenCalled();
});
it('new projects open new queries while metadata-only catalog changes do not reconnect', () => {
  subscribeAuthorizedOwnRecords(db, 'alice', vi.fn(), vi.fn());
  mocks.catalogNext!(catalog(['p']));
  mocks.catalogNext!(catalog(['p'], true));
  expect(mocks.listeners).toHaveLength(1);
  mocks.catalogNext!(catalog(['p', 'q']));
  expect(mocks.listeners).toHaveLength(2);
});
it('keeps complete owner histories unlimited and preserves cache/pending indicators', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  mocks.catalogNext!(catalog(['p']));
  const rows = Array.from(
    { length: 150 },
    (_, i) =>
      [String(i).padStart(3, '0'), { projectId: 'p' }] as [
        string,
        Record<string, unknown>,
      ],
  );
  mocks.listeners[0].next(records(rows, false, true));
  expect(next.mock.lastCall?.[0]).toMatchObject({
    fromCache: true,
    hasMore: false,
  });
  expect(next.mock.lastCall?.[0].rows).toHaveLength(150);
});
it('filters pending records by endedAt null without limits or paging', () => {
  subscribeAuthorizedOwnRecords(db, 'alice', vi.fn(), vi.fn(), {
    openOnly: true,
  });
  mocks.catalogNext!(catalog(['p']));
  expect(mocks.listeners[0].q.constraints).toContainEqual([
    'where',
    'endedAt',
    '==',
    null,
  ]);
  expect(mocks.listeners[0].q.constraints.some((c) => c[0] === 'limit')).toBe(
    false,
  );
});
it('merges scoped raw pages with physical cursors and no skip over tombstones', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn(), {
    size: 2,
    after: '100',
  });
  mocks.catalogNext!(catalog(['p', 'q']));
  for (const listener of mocks.listeners) {
    expect(listener.q.constraints).toContainEqual(['after', '100']);
    expect(listener.q.constraints).toContainEqual(['limit', 2]);
  }
  mocks.listeners[0].next(
    records([
      ['101', { projectId: 'p', deletedAt: 'gone' }],
      ['104', { projectId: 'p' }],
    ]),
  );
  mocks.listeners[1].next(
    records([
      ['102', { projectId: 'q' }],
      ['103', { projectId: 'q' }],
    ]),
  );
  expect(next.mock.lastCall?.[0]).toMatchObject({
    rows: [{ id: '101' }, { id: '102' }],
    hasMore: true,
    cursor: '102',
  });
});
it('fails closed on catalog or active record errors and stops every subscription', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, fail);
  mocks.catalogNext!(catalog(['p']));
  mocks.listeners[0].next(records([['r', { projectId: 'p' }]]));
  mocks.catalogError!();
  expect(fail).toHaveBeenCalledOnce();
  expect(mocks.catalogStop).toHaveBeenCalledOnce();
  expect(mocks.listeners[0].stop).toHaveBeenCalledOnce();
  mocks.listeners[0].next(records([['late', {}]]));
  expect(next.mock.lastCall?.[0].rows).toEqual([
    { id: 'r', data: { projectId: 'p' } },
  ]);
});
it('account disposal ignores callbacks and stops the catalog as well as records', () => {
  const next = vi.fn();
  const stop = subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  mocks.catalogNext!(catalog(['p']));
  stop();
  stop();
  mocks.catalogNext!(catalog(['q']));
  mocks.listeners[0].next(records([['late', {}]]));
  expect(next).toHaveBeenCalledTimes(1);
  expect(mocks.listeners).toHaveLength(1);
  expect(mocks.catalogStop).toHaveBeenCalledOnce();
});
