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

import { subscribeAuthorizedProjects } from './authorized-project-source';
it('observes the account materialization without reconnecting or reading Firebase', () => {
  const next = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, vi.fn());
  expect(mocks.observe).toHaveBeenCalledWith(db, 'alice', expect.any(Function));
  const projects = [
    { id: 'legacy', data: { title: 'Legacy' } },
    { id: 'own', data: { type: 'personal', createdBy: 'alice' } },
  ];
  emit(state({ projects }));
  expect(next).toHaveBeenLastCalledWith({
    rows: projects,
    complete: true,
    fromCache: false,
    hasPendingWrites: false,
  });
  emit(state({ projects, syncing: true }));
  expect(next.mock.lastCall?.[0].rows).toEqual(projects);
  expect(mocks.observe).toHaveBeenCalledOnce();
});
it('does not confirm cold or incomplete materializations as an empty catalog', () => {
  const next = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, vi.fn());
  emit(state({ complete: false, projects: [{ id: 'stale', data: {} }] }));
  expect(next).toHaveBeenLastCalledWith({
    rows: [],
    complete: false,
    fromCache: true,
    hasPendingWrites: false,
  });
  emit(state());
  expect(next.mock.lastCall?.[0].complete).toBe(true);
});
it('replaces create/update/delete and revoked catalog rows atomically', () => {
  const next = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, vi.fn());
  emit(state({ projects: [{ id: 'p', data: { title: 'Before' } }] }));
  emit(
    state({
      projects: [
        { id: 'p', data: { title: 'After' } },
        { id: 'new', data: {} },
      ],
    }),
  );
  expect(next.mock.lastCall?.[0].rows).toHaveLength(2);
  expect(next.mock.lastCall?.[0].rows[0].data.title).toBe('After');
  // The session synchronizer owns ACL evaluation and removes revoked parents.
  emit(state());
  expect(next.mock.lastCall?.[0].rows).toEqual([]);
});
it('reports local authorization/storage errors without publishing stale rows and can recover', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedProjects(db, 'alice', next, fail);
  emit(
    state({
      error: 'permission-denied',
      projects: [{ id: 'stale', data: {} }],
    }),
  );
  expect(fail).toHaveBeenCalledOnce();
  expect(next).not.toHaveBeenCalled();
  emit(state());
  expect(next.mock.lastCall?.[0].rows).toEqual([]);
});
it('disposes only its local observer and keeps accounts independent', () => {
  const alice = vi.fn(),
    bob = vi.fn();
  const stop = subscribeAuthorizedProjects(db, 'alice', alice, vi.fn());
  subscribeAuthorizedProjects(db, 'bob', bob, vi.fn());
  stop();
  emit(state());
  emit(state(), 1);
  expect(mocks.observers[0].stop).toHaveBeenCalledOnce();
  expect(alice).not.toHaveBeenCalled();
  expect(bob).toHaveBeenCalledOnce();
});
