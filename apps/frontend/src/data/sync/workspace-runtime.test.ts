import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  create: vi.fn(),
  listen: vi.fn(),
  call: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('./workspace-storage', async (load) => ({
  ...(await load<typeof import('./workspace-storage')>()),
  openWorkspaceStorage: mocks.open,
}));
vi.mock('./workspace-sync', async (load) => ({
  ...(await load<typeof import('./workspace-sync')>()),
  createWorkspaceSync: mocks.create,
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args) => args),
  onSnapshot: mocks.listen,
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: () => mocks.call,
}));
vi.mock('../cache/project-access-revision', () => ({
  invalidateProjectAccess: mocks.invalidate,
}));
import type { Firestore } from 'firebase/firestore';
import {
  observeWorkspace,
  startWorkspaceSession,
  workspaceRetry,
} from './workspace-runtime';
import { initialSnapshot, type SyncTransport } from './workspace-sync';
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function environment() {
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    hasFocus: () => true,
  });
  const window = new EventTarget();
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('location', { origin: 'http://localhost:5191' });
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn(async (_: string, fn: () => Promise<unknown>) => fn()),
    },
  });
  return { document, window };
}
function controller() {
  const sync = {
    focus: vi.fn(),
    retry: vi.fn(),
    dispose: vi.fn(),
    subscribe: vi.fn((fn) => {
      fn(initialSnapshot());
      return () => {};
    }),
  };
  mocks.create.mockReturnValue(sync);
  return sync;
}
it('observers are local and do not start listeners, pulls or storage', () => {
  const stop = observeWorkspace({} as Firestore, 'alice', () => {});
  expect(mocks.listen).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.call).not.toHaveBeenCalled();
  stop();
});
it('root alone owns focus lifetime and retries; logout disposes everything', async () => {
  const env = environment();
  const sync = controller();
  mocks.open.mockResolvedValue({ close: vi.fn() });
  const db = {
    app: { options: { projectId: 'demo-work-track' } },
  } as Firestore;
  const stop = startWorkspaceSession(db, 'alice');
  await settle();
  expect(sync.focus).toHaveBeenCalledWith(true);
  env.document.visibilityState = 'hidden';
  env.document.dispatchEvent(new Event('visibilitychange'));
  expect(sync.focus).toHaveBeenLastCalledWith(false);
  env.document.visibilityState = 'visible';
  env.window.dispatchEvent(new Event('focus'));
  expect(sync.focus).toHaveBeenLastCalledWith(true);
  workspaceRetry(db, 'bob');
  expect(sync.retry).not.toHaveBeenCalled();
  workspaceRetry(db, 'alice');
  expect(sync.retry).toHaveBeenCalledOnce();
  stop();
  expect(sync.dispose).toHaveBeenCalledOnce();
  env.window.dispatchEvent(new Event('focus'));
  expect(sync.focus).toHaveBeenCalledTimes(3);
});
it('retry reopens failed IndexedDB without remote fallback', async () => {
  environment();
  controller();
  mocks.open
    .mockRejectedValueOnce(new Error('blocked'))
    .mockResolvedValueOnce({ close: vi.fn() });
  const db = {
    app: { options: { projectId: 'demo-work-track' } },
  } as Firestore;
  const values: string[] = [];
  const observe = observeWorkspace(db, 'alice', (s) => values.push(s.error));
  const stop = startWorkspaceSession(db, 'alice');
  await settle();
  expect(values).toContain('blocked');
  expect(mocks.listen).not.toHaveBeenCalled();
  workspaceRetry(db, 'alice');
  await settle();
  expect(mocks.open).toHaveBeenCalledTimes(2);
  stop();
  observe();
});
it('transport listens only to head and discards cache metadata notifications', async () => {
  environment();
  controller();
  mocks.open.mockResolvedValue({ close: vi.fn() });
  const db = {
    app: { options: { projectId: 'demo-work-track' } },
  } as Firestore;
  const stop = startWorkspaceSession(db, 'alice');
  await settle();
  const transport = mocks.create.mock.calls[0][2] as SyncTransport;
  const changed = vi.fn();
  transport.listen(changed, vi.fn());
  const callback = mocks.listen.mock.calls[0][2] as (s: {
    metadata: { fromCache: boolean };
  }) => void;
  callback({ metadata: { fromCache: true } });
  expect(changed).not.toHaveBeenCalled();
  callback({ metadata: { fromCache: false } });
  expect(changed).toHaveBeenCalledOnce();
  expect(mocks.listen.mock.calls[0][0]).toEqual([db, 'webSyncState', 'head']);
  stop();
});
