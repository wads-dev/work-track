import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import type { WorkspaceSnapshot } from '../sync/workspace-sync';
const mocks = vi.hoisted(() => ({
  observers: [] as {
    uid: string;
    next: (value: WorkspaceSnapshot) => void;
    stop: ReturnType<typeof vi.fn>;
    active: boolean;
  }[],
  observe: vi.fn(),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  callable: vi.fn(),
}));
vi.mock('../sync/workspace-runtime', () => ({
  observeWorkspace: mocks.observe,
}));
vi.mock('firebase/firestore', () => ({
  onSnapshot: mocks.onSnapshot,
  getDocs: mocks.getDocs,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
const db = {} as Firestore;
const state = (patch: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot => ({
  projects: [],
  records: [],
  completedProjects: [],
  complete: true,
  syncing: false,
  error: '',
  ...patch,
});
const emit = (value: WorkspaceSnapshot, index = 0) => {
  const observer = mocks.observers[index];
  if (observer.active) observer.next(value);
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.observers.splice(0);
  mocks.observe.mockImplementation(
    (_db: Firestore, uid: string, next: (value: WorkspaceSnapshot) => void) => {
      const observer = {
        uid,
        next,
        active: true,
        stop: vi.fn(() => {
          observer.active = false;
        }),
      };
      mocks.observers.push(observer);
      return observer.stop;
    },
  );
});
afterEach(() => {
  expect(mocks.onSnapshot).not.toHaveBeenCalled();
  expect(mocks.getDocs).not.toHaveBeenCalled();
  expect(mocks.callable).not.toHaveBeenCalled();
});

import { subscribeAuthorizedOwnRecords } from './authorized-own-record-source';
const row = (
  id: string,
  patch: Record<string, unknown> = {},
  uid = 'alice',
) => ({
  path: 'users/' + uid + '/records/' + id,
  data: { uid, projectId: 'p', ...patch },
});
it('fences incomplete history and never confirms a provisional empty result', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  emit(state({ complete: false, records: [row('stale')] }));
  expect(next).toHaveBeenLastCalledWith({
    rows: [],
    fromCache: true,
    hasMore: false,
    cursor: '',
  });
  emit(state());
  expect(next.mock.lastCall?.[0].fromCache).toBe(false);
});
it('reads only own records from authorized local state and replaces revoked histories', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  emit(state({ records: [row('own'), row('other', {}, 'bob')] }));
  expect(next.mock.lastCall?.[0].rows.map((r: { id: string }) => r.id)).toEqual(
    ['own'],
  );
  emit(state());
  expect(next.mock.lastCall?.[0].rows).toEqual([]);
  expect(mocks.observe).toHaveBeenCalledOnce();
});
it('keeps complete raw owner history unlimited including physical tombstones', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn());
  const records = Array.from({ length: 501 }, (_, i) =>
    row(
      String(i).padStart(4, '0'),
      i === 1 ? { deletedAt: 'legacy', topics: 'invalid' } : {},
    ),
  );
  emit(state({ records }));
  expect(next.mock.lastCall?.[0].rows).toHaveLength(501);
  expect(next.mock.lastCall?.[0].rows[1].data.deletedAt).toBe('legacy');
  expect(next.mock.lastCall?.[0]).toMatchObject({
    hasMore: false,
    cursor: '0500',
    fromCache: false,
  });
});
it('open-only preserves strict endedAt null semantics without defaulting missing end', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn(), { openOnly: true });
  emit(
    state({
      records: [
        row('missing'),
        row('closed', { endedAt: '2026-10-08' }),
        row('open', { endedAt: null }),
      ],
    }),
  );
  expect(next.mock.lastCall?.[0].rows.map((r: { id: string }) => r.id)).toEqual(
    ['open'],
  );
});
it('sorts local physical IDs and pages past tombstones without skipping the cursor', () => {
  const next = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', next, vi.fn(), {
    size: 2,
    after: 'a',
  });
  emit(
    state({
      records: [
        row('d'),
        row('a'),
        row('c'),
        row('b', { deletedAt: 'removed' }),
      ],
    }),
  );
  expect(next.mock.lastCall?.[0]).toMatchObject({
    rows: [{ id: 'b' }, { id: 'c' }],
    hasMore: true,
    cursor: 'c',
  });
  const page = vi.fn();
  subscribeAuthorizedOwnRecords(db, 'alice', page, vi.fn(), {
    size: 2,
    after: 'c',
  });
  emit(state({ records: [row('d'), row('c')] }), 1);
  expect(page.mock.lastCall?.[0]).toMatchObject({
    rows: [{ id: 'd' }],
    hasMore: false,
    cursor: 'd',
  });
  emit(state(), 1);
  expect(page.mock.lastCall?.[0].cursor).toBe('c');
});
it('reports errors without publishing stale rows and detaches on disposal', () => {
  const next = vi.fn(),
    fail = vi.fn();
  const stop = subscribeAuthorizedOwnRecords(db, 'alice', next, fail);
  emit(state({ error: 'cache failure', records: [row('stale')] }));
  expect(fail).toHaveBeenCalledOnce();
  expect(next).not.toHaveBeenCalled();
  stop();
  emit(state({ records: [row('late')] }));
  expect(next).not.toHaveBeenCalled();
  expect(mocks.observers[0].stop).toHaveBeenCalledOnce();
});
