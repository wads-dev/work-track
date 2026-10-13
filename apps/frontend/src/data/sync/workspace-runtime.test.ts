import { afterEach, expect, it, vi } from 'vitest';
import type { WorkspaceSnapshot, LocalDocument } from './workspace-sync';
type Target = { key: string };
type Options = { source?: string; includeMetadataChanges: boolean };
type Snapshot = { metadata: { fromCache: boolean; hasPendingWrites: boolean } };
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
    l.next({ metadata: { fromCache: false, hasPendingWrites: false } });
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
  expect(m.enable).toHaveBeenCalledTimes(2);
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
    l.next({ metadata: { fromCache: false, hasPendingWrites: false } }),
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
