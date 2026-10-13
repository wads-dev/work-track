import { afterEach, expect, it, vi } from 'vitest';
import type { WorkspaceSnapshot, LocalDocument } from './workspace-sync';
type Target = { key: string };
type Options = { source?: string; includeMetadataChanges: boolean };
type Snapshot = {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  size: number;
  docChanges: () => unknown[];
};
const m = vi.hoisted(() => ({
  listeners: [] as {
    target: Target;
    options: Options;
    next: (s: Snapshot) => void;
    fail: (e: Error) => void;
    stop: ReturnType<typeof vi.fn>;
  }[],
  cache: new Map<string, LocalDocument[]>(),
  disable: vi.fn(async () => {}),
  enable: vi.fn(async () => {}),
  call: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, path: string) => ({ path }),
  collectionGroup: (_: unknown, path: string) => ({ path: 'group:' + path }),
  where: (...args: unknown[]) => args,
  query: (base: { path: string }, ...filters: unknown[]) => ({
    key: JSON.stringify([base.path, ...filters]),
  }),
  onSnapshot: (
    target: Target,
    options: Options,
    next: (s: Snapshot) => void,
    fail: (e: Error) => void,
  ) => {
    const stop = vi.fn();
    m.listeners.push({ target, options, next, fail, stop });
    return stop;
  },
  getDocsFromCache: async (t: Target) => ({
    size: (m.cache.get(t.key) ?? []).length,
    docs: (m.cache.get(t.key) ?? []).map((r) => ({
      ref: { path: r.path },
      data: () => r.data,
    })),
  }),
  disableNetwork: m.disable,
  enableNetwork: m.enable,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: m.call }));
import {
  observeWorkspace,
  observeWorkspaceAudit,
  startWorkspaceSession,
  workspaceRetry,
} from './workspace-runtime';
import type { Firestore } from 'firebase/firestore';
const db = {} as Firestore;
function env() {
  let focus = true;
  const d = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    hasFocus: () => focus,
  });
  vi.stubGlobal('document', d);
  vi.stubGlobal('window', new EventTarget());
  return {
    d,
    setFocus: (v: boolean) => {
      focus = v;
      window.dispatchEvent(new Event(v ? 'focus' : 'blur'));
    },
  };
}
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function send(path: string, rows: LocalDocument[]) {
  const targets = m.listeners.filter(
    (l) => l.target.key.includes(path) && !l.stop.mock.calls.length,
  );
  for (const l of targets) {
    m.cache.set(l.target.key, rows);
    if (l.target.key.includes('group:records'))
      m.cache.set(JSON.stringify(['group:records']), rows);
    l.next({
      metadata: { fromCache: false, hasPendingWrites: false },
      size: rows.length,
      docChanges: () => [],
    });
  }
  await settle();
}
afterEach(() => {
  vi.unstubAllGlobals();
  m.listeners = [];
  m.cache.clear();
  vi.clearAllMocks();
});
it('views never create Firestore or callable work', () => {
  const stop = observeWorkspace(db, 'alice', () => {});
  expect(m.listeners).toHaveLength(0);
  expect(m.call).not.toHaveBeenCalled();
  stop();
});
it('native global targets survive navigation and use only cached data for projections', async () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [
    { path: 'projects/p', data: { id: 'p', type: 'work', createdBy: 'alice' } },
  ]);
  await send('group:records', [
    { path: 'users/bob/records/r', data: { uid: 'bob', projectId: 'p' } },
  ]);
  let snapshot: WorkspaceSnapshot | undefined;
  const observe = observeWorkspace(db, 'alice', (s) => (snapshot = s));
  expect(snapshot!.complete).toBe(true);
  expect(snapshot!.records).toHaveLength(1);
  const count = m.listeners.length;
  for (let i = 0; i < 30; i++) observeWorkspace(db, 'alice', () => {})();
  expect(m.listeners).toHaveLength(count);
  expect(m.call).not.toHaveBeenCalled();
  observe();
  stop();
});
it('focus disables SDK network without destroying query resume targets, resume enables it', async () => {
  const e = env();
  const stop = startWorkspaceSession(db, 'alice');
  const count = m.listeners.length;
  e.setFocus(false);
  await settle();
  expect(m.disable).toHaveBeenCalledOnce();
  expect(m.listeners.every((l) => l.stop.mock.calls.length === 0)).toBe(true);
  e.setFocus(true);
  await settle();
  expect(m.enable).toHaveBeenCalledOnce();
  expect(m.listeners).toHaveLength(count);
  stop();
});
it('revocation removes project rows and late callbacks cannot restore account data', async () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [{ path: 'projects/p', data: { type: 'work' } }]);
  await send('group:records', [
    { path: 'users/alice/records/r', data: { uid: 'alice', projectId: 'p' } },
  ]);
  await send('projects', []);
  let snapshot: WorkspaceSnapshot | undefined;
  const observe = observeWorkspace(db, 'alice', (s) => (snapshot = s));
  expect(snapshot!.records).toEqual([]);
  const old = m.listeners.slice();
  stop();
  old.forEach((l) =>
    l.next({
      metadata: { fromCache: false, hasPendingWrites: false },
      size: 0,
      docChanges: () => [],
    }),
  );
  await settle();
  expect(snapshot!.complete).toBe(false);
  observe();
});
it('retry reopens failed native subscriptions but is scoped to the current user', async () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  m.listeners[0].fail(new Error('denied'));
  const count = m.listeners.length;
  workspaceRetry(db, 'bob');
  expect(m.listeners).toHaveLength(count);
  workspaceRetry(db, 'alice');
  expect(m.listeners.length).toBeGreaterThan(count);
  expect(
    m.listeners.slice(0, count).every((l) => l.stop.mock.calls.length),
  ).toBe(true);
  stop();
});

it('never re-enables an already-enabled SDK at initial focus and opens one listener per target', () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  expect(m.enable).not.toHaveBeenCalled();
  expect(m.listeners).toHaveLength(2);
  expect(new Set(m.listeners.map((l) => l.target.key)).size).toBe(2);
  expect(m.listeners.every((l) => !l.options.source)).toBe(true);
  stop();
});
it('hundreds of records do not open hundreds of audit listeners; audit loading cannot block reports', async () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [
    { path: 'projects/p', data: { type: 'work', createdBy: 'alice' } },
  ]);
  await send(
    'group:records',
    Array.from({ length: 500 }, (_, i) => ({
      path: 'users/alice/records/r' + i,
      data: { uid: 'alice', projectId: 'p' },
    })),
  );
  let snapshot: WorkspaceSnapshot | undefined;
  const observe = observeWorkspace(db, 'alice', (s) => (snapshot = s));
  expect(snapshot!.complete).toBe(true);
  expect(m.listeners).toHaveLength(3);
  const audit = observeWorkspaceAudit(
    db,
    'alice',
    'users/alice/records/r0',
    (s) => (snapshot = s),
  );
  expect(m.listeners).toHaveLength(4);
  expect(snapshot!.complete).toBe(true);
  await send('users/alice/records/r0/audit', []);
  expect(snapshot!.auditReady).toContain('users/alice/records/r0');
  audit();
  observe();
  stop();
});
it('metadata replays and blur preserve complete local views without notifications or target churn', async () => {
  const e = env();
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [{ path: 'projects/p', data: { type: 'work' } }]);
  await send('group:records', [
    { path: 'users/bob/records/r', data: { uid: 'bob', projectId: 'p' } },
  ]);
  const next = vi.fn();
  const observe = observeWorkspace(db, 'alice', next);
  const before = next.mock.calls.at(-1)![0];
  await send('group:records', [
    { path: 'users/bob/records/r', data: { uid: 'bob', projectId: 'p' } },
  ]);
  expect(next).toHaveBeenCalledOnce();
  e.setFocus(false);
  await settle();
  expect(next).toHaveBeenCalledOnce();
  expect(before.complete).toBe(true);
  e.setFocus(true);
  e.setFocus(true);
  await settle();
  expect(m.enable).toHaveBeenCalledOnce();
  observe();
  stop();
});
it('authorization grouping opens only one global records target for up to ten projects', async () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  await send(
    'projects',
    Array.from({ length: 21 }, (_, i) => ({
      path: 'projects/p' + i,
      data: { type: 'work' },
    })),
  );
  expect(m.listeners).toHaveLength(5);
  const targets = m.listeners.filter((l) =>
    l.target.key.includes('group:records'),
  );
  expect(targets).toHaveLength(3);
  expect(targets.every((l) => l.target.key.includes('"in"'))).toBe(true);
  stop();
});

it('bypasses partially-backfilled group indexes locally while rejecting cached foreign project rows', async () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [{ path: 'projects/p', data: { type: 'work' } }]);
  const target = m.listeners.find((l) =>
    l.target.key.includes('group:records'),
  )!;
  const all = Array.from({ length: 401 }, (_, i) => ({
    path: 'users/alice/records/r' + i,
    data: { uid: 'alice', projectId: 'p' },
  }));
  m.cache.set(target.target.key, all.slice(0, 380));
  m.cache.set(JSON.stringify(['group:records']), [
    ...all,
    {
      path: 'users/bob/records/secret',
      data: { uid: 'bob', projectId: 'foreign-personal' },
    },
  ]);
  target.next({
    metadata: { fromCache: false, hasPendingWrites: false },
    size: 380,
    docChanges: () => [],
  });
  await settle();
  let snapshot: WorkspaceSnapshot | undefined;
  const observe = observeWorkspace(db, 'alice', (s) => (snapshot = s));
  expect(snapshot!.complete).toBe(true);
  expect(snapshot!.records).toHaveLength(401);
  expect(
    snapshot!.records.some((r) => r.data.projectId === 'foreign-personal'),
  ).toBe(false);
  expect(
    m.listeners.filter((l) => l.target.key.includes('group:records')),
  ).toHaveLength(1);
  expect(target.target.key).toContain('"in"');
  observe();
  stop();
});

it('online events let SDK reconnect without recreating targets or blanking local views', async () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [{ path: 'projects/p', data: { type: 'work' } }]);
  await send('group:records', []);
  const next = vi.fn();
  const observe = observeWorkspace(db, 'alice', next);
  const listeners = m.listeners.length;
  window.dispatchEvent(new Event('online'));
  await settle();
  expect(m.listeners).toHaveLength(listeners);
  expect(next).toHaveBeenCalledOnce();
  expect(next.mock.calls[0][0].complete).toBe(true);
  observe();
  stop();
});
it('audit observer mounted before authentication session acquires its demand when session begins', async () => {
  env();
  const observer = observeWorkspaceAudit(
    db,
    'alice',
    'users/alice/records/r',
    () => {},
  );
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [{ path: 'projects/p', data: { type: 'work' } }]);
  await send('group:records', [
    { path: 'users/alice/records/r', data: { uid: 'alice', projectId: 'p' } },
  ]);
  expect(
    m.listeners.some((l) =>
      l.target.key.includes('users/alice/records/r/audit'),
    ),
  ).toBe(true);
  observer();
  stop();
});
