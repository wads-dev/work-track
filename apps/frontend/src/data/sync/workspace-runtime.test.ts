import { afterEach, expect, it, vi } from 'vitest';
import type { WorkspaceSignal, LocalDocument } from './workspace-sync';
it('synchronizes only explicit work and owner-qualified personal projects', () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  expect(
    m.listeners.map((listener) => JSON.parse(listener.target.key)),
  ).toEqual([
    ['projects', ['type', '==', 'work']],
    ['projects', ['type', '==', 'personal'], ['createdBy', '==', 'alice']],
  ]);
  stop();
});
type Target = { key: string };
type Options = { source?: string; includeMetadataChanges: boolean };
type Snapshot = {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  size: number;
  docs: {
    id: string;
    ref: { path: string };
    data: () => Record<string, unknown>;
  }[];
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
  cacheListeners: [] as {
    target: Target;
    options: Options;
    next: (s: Snapshot) => void;
    fail: (e: Error) => void;
    stop: ReturnType<typeof vi.fn>;
  }[],
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
    if (options.source === 'cache') {
      m.cacheListeners.push({ target, options, next, fail, stop });
      return stop;
    }
    m.listeners.push({ target, options, next, fail, stop });
    return stop;
  },
  getDocsFromCache: vi.fn(() => {
    throw new Error('Listener must use snapshot documents, not reread cache');
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
async function send(path: string, rows: LocalDocument[], changed = true) {
  const targets = m.listeners.filter(
    (l) => l.target.key.includes(path) && !l.stop.mock.calls.length,
  );
  for (const l of targets) {
    l.next({
      metadata: { fromCache: false, hasPendingWrites: false },
      size: rows.length,
      docs: rows.map((r) => ({
        id: r.path.split('/').at(-1)!,
        ref: { path: r.path },
        data: () => r.data,
      })),
      docChanges: () =>
        changed
          ? [
              {
                type: rows.length ? 'modified' : 'removed',
                doc: { metadata: { hasPendingWrites: false } },
              },
            ]
          : [],
    });
  }
  await settle();
}
afterEach(() => {
  vi.unstubAllGlobals();
  m.listeners = [];
  m.cacheListeners = [];
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
    {
      path: 'projects/p',
      data: {
        id: 'p',
        type: 'work',
        createdBy: 'alice',
        archived: false,
        confidential: false,
        topics: [],
      },
    },
  ]);
  await send('group:records', [
    {
      path: 'users/bob/records/r',
      data: {
        uid: 'bob',
        projectId: 'p',
        endedAt: null,
        deletedAt: null,
        topics: [],
      },
    },
  ]);
  let snapshot: WorkspaceSignal | undefined;
  const observe = observeWorkspace(db, 'alice', (s) => (snapshot = s));
  expect(snapshot!.complete).toBe(true);
  expect(snapshot!.completedProjects).toEqual(['p']);
  expect(snapshot).not.toHaveProperty('records');
  expect(snapshot).not.toHaveProperty('projects');
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
  await send('projects', [
    {
      path: 'projects/p',
      data: { type: 'work', archived: false, confidential: false, topics: [] },
    },
  ]);
  await send('group:records', [
    {
      path: 'users/alice/records/r',
      data: {
        uid: 'alice',
        projectId: 'p',
        endedAt: null,
        deletedAt: null,
        topics: [],
      },
    },
  ]);
  await send('projects', []);
  let snapshot: WorkspaceSignal | undefined;
  const observe = observeWorkspace(db, 'alice', (s) => (snapshot = s));
  expect(snapshot!.completedProjects).toEqual([]);
  const old = m.listeners.slice();
  stop();
  old.forEach((l) =>
    l.next({
      metadata: { fromCache: false, hasPendingWrites: false },
      size: 0,
      docs: [],
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
    {
      path: 'projects/p',
      data: {
        type: 'work',
        createdBy: 'alice',
        archived: false,
        confidential: false,
        topics: [],
      },
    },
  ]);
  await send(
    'group:records',
    Array.from({ length: 500 }, (_, i) => ({
      path: 'users/alice/records/r' + i,
      data: {
        uid: 'alice',
        projectId: 'p',
        endedAt: null,
        deletedAt: null,
        topics: [],
      },
    })),
  );
  let snapshot: WorkspaceSignal | undefined;
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
  const auditChanged = vi.fn();
  const stopAuditChanged = observeWorkspace(db, 'alice', auditChanged);
  auditChanged.mockClear();
  await send('users/alice/records/r0/audit', [
    { path: 'users/alice/records/r0/audit/a', data: { action: 'updated' } },
  ]);
  expect(auditChanged).toHaveBeenCalled();
  stopAuditChanged();
  expect(snapshot).not.toHaveProperty('audits');
  audit();
  observe();
  stop();
});
it('metadata-only events do not invalidate content while blur preserves readiness and targets', async () => {
  const e = env();
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [
    {
      path: 'projects/p',
      data: { type: 'work', archived: false, confidential: false, topics: [] },
    },
  ]);
  await send('group:records', [
    {
      path: 'users/bob/records/r',
      data: {
        uid: 'bob',
        projectId: 'p',
        endedAt: null,
        deletedAt: null,
        topics: [],
      },
    },
  ]);
  const next = vi.fn();
  const observe = observeWorkspace(db, 'alice', next);
  const before = next.mock.calls.at(-1)![0];
  await send(
    'group:records',
    [
      {
        path: 'users/bob/records/r',
        data: {
          uid: 'bob',
          projectId: 'p',
          endedAt: null,
          deletedAt: null,
          topics: [],
        },
      },
    ],
    false,
  );
  expect(next).toHaveBeenCalledTimes(1);
  e.setFocus(false);
  await settle();
  expect(next).toHaveBeenCalledTimes(1);
  expect(before.complete).toBe(true);
  await send('group:records', [
    {
      path: 'users/bob/records/r',
      data: {
        uid: 'bob',
        projectId: 'p',
        endedAt: '2026-10-01T01:00:00Z',
        deletedAt: null,
        topics: [],
      },
    },
  ]);
  expect(next).toHaveBeenCalledTimes(2);
  expect(next.mock.lastCall![0].dataRevision).toBeGreaterThan(
    before.dataRevision,
  );
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
      data: { type: 'work', archived: false, confidential: false, topics: [] },
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

it('online events let SDK reconnect without recreating targets or blanking local views', async () => {
  env();
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [
    {
      path: 'projects/p',
      data: { type: 'work', archived: false, confidential: false, topics: [] },
    },
  ]);
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
  await send('projects', [
    {
      path: 'projects/p',
      data: { type: 'work', archived: false, confidential: false, topics: [] },
    },
  ]);
  await send('group:records', [
    {
      path: 'users/alice/records/r',
      data: {
        uid: 'alice',
        projectId: 'p',
        endedAt: null,
        deletedAt: null,
        topics: [],
      },
    },
  ]);
  expect(
    m.listeners.some((l) =>
      l.target.key.includes('users/alice/records/r/audit'),
    ),
  ).toBe(true);
  observer();
  stop();
});

it('remote counter counts added/modified documents but not removals, pending echoes or confirmations', async () => {
  env();
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
  vi.stubGlobal('navigator', {});
  const stop = startWorkspaceSession(db, 'alice');
  await send('projects', [
    {
      path: 'projects/p',
      data: { type: 'work', archived: false, confidential: false, topics: [] },
    },
  ]);
  store.clear();
  const target = m.listeners.find((l) =>
    l.target.key.includes('group:records'),
  )!;
  target.next({
    metadata: { fromCache: false, hasPendingWrites: false },
    size: 400,
    docs: [],
    docChanges: () => [
      { type: 'added', doc: { metadata: { hasPendingWrites: false } } },
      { type: 'modified', doc: { metadata: { hasPendingWrites: false } } },
      { type: 'removed', doc: { metadata: { hasPendingWrites: false } } },
      { type: 'added', doc: { metadata: { hasPendingWrites: true } } },
    ],
  });
  await settle();
  expect(store.get('work-track:firestore:remote-doc-reads')).toBe('2');
  target.next({
    metadata: { fromCache: false, hasPendingWrites: false },
    size: 400,
    docs: [],
    docChanges: () => [],
  });
  await settle();
  expect(store.get('work-track:firestore:remote-doc-reads')).toBe('2');
  stop();
});
