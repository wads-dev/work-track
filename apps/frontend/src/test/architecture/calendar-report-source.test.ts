import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import type { WorkspaceSnapshot } from '../../data/sync/workspace-sync';
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
vi.mock('../../data/sync/workspace-runtime', () => ({
  observeWorkspace: mocks.observe,
}));
vi.mock('firebase/firestore', () => ({
  onSnapshot: mocks.onSnapshot,
  getDocs: mocks.getDocs,
  collectionGroup: (_db: unknown, group: string) => ({ group }),
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  query: (base: unknown, ...constraints: unknown[]) => ({ base, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
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

import { subscribePersonalReport } from '../../data/sources/personal-report-source';
import { subscribeAuthorizedReport } from '../../data/sources/authorized-report-source';

const project = (id = 'p', data: Record<string, unknown> = {}) => ({
  id,
  data: { type: 'work', topics: [], ...data },
});
const row = (id = 'r', patch: Record<string, unknown> = {}, uid = 'alice') => ({
  path: 'users/' + uid + '/records/' + id,
  data: {
    uid,
    projectId: 'p',
    startedAt: '2026-10-08T12:00:00Z',
    timeZone: 'UTC',
    topics: [],
    ...patch,
  },
});

const range = {
  from: '2026-10-08T00:00:00Z',
  to: '2026-10-09T00:00:00Z',
  projectId: 'p',
};
it('navigation, date and project changes use local observers with ZERO Firebase reads or callables', async () => {
  const personal = vi.fn(),
    company = vi.fn();
  const stopPersonal = subscribePersonalReport(
    db,
    'alice',
    personal,
    vi.fn(),
    ['p'],
    range,
  );
  const stopCompany = subscribeAuthorizedReport(
    db,
    'alice',
    company,
    vi.fn(),
    ['q'],
    { ...range, projectId: 'q' },
  );
  const local = state({
    projects: [project(), project('q')],
    records: [
      row('open'),
      row('closed', { endedAt: '2026-10-08T13:00:00Z' }),
      row('budget', { projectId: 'q', startedAt: '2026-01-01T00:00:00Z' }),
    ],
  });
  emit(local);
  emit(local, 1);
  expect(
    (
      await personal.mock.lastCall![0].repository.readPage('alice', 100)
    ).records.map((r: { id: string }) => r.id),
  ).toEqual(['closed', 'open']);
  expect(
    await personal.mock.lastCall![0].repository.loadContext(['alice']),
  ).toHaveLength(3);
  expect(
    await company.mock.lastCall![0].repository.readPage(100),
  ).toMatchObject({ records: [] });
  stopPersonal();
  stopCompany();
  const month = vi.fn();
  const stopMonth = subscribePersonalReport(db, 'alice', month, vi.fn(), [], {
    from: '2026-01-01T00:00:00Z',
    to: '2026-02-01T00:00:00Z',
  });
  emit(local, 2);
  expect(
    (
      await month.mock.lastCall![0].repository.readPage('alice', 100)
    ).records.map((r: { id: string }) => r.id),
  ).toEqual(['budget']);
  stopMonth();
  expect(mocks.observe).toHaveBeenCalledTimes(3);
  for (const observer of mocks.observers)
    expect(observer.stop).toHaveBeenCalledOnce();
});
it('waits for a full atomic materialization and retains missing-end records without query branches', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail, [], range);
  emit(
    state({ complete: false, projects: [project()], records: [row('open')] }),
  );
  expect(next).not.toHaveBeenCalled();
  emit(
    state({
      projects: [project()],
      records: [
        row('open'),
        row('null-end', { endedAt: null }),
        row('closed', { endedAt: '2026-10-08T13:00:00Z' }),
      ],
    }),
  );
  const context = await next.mock.lastCall![0].repository.loadContext([
    'alice',
  ]);
  expect(context.map((r: { id: string }) => r.id)).toEqual([
    'open',
    'null-end',
    'closed',
  ]);
  expect(context[0].endedAt).toBeUndefined();
  expect(context[1].endedAt).toBeUndefined();
  expect(fail).not.toHaveBeenCalled();
});
it('local project moves update selection atomically without narrowing global budget context', async () => {
  const next = vi.fn();
  subscribePersonalReport(db, 'alice', next, vi.fn(), ['p'], range);
  emit(
    state({ projects: [project(), project('q')], records: [row('moving')] }),
  );
  const old = next.mock.lastCall![0].repository;
  emit(
    state({
      complete: false,
      projects: [project(), project('q')],
      records: [row('moving', { projectId: 'q' })],
    }),
  );
  expect(next).toHaveBeenCalledOnce();
  emit(
    state({
      projects: [project(), project('q')],
      records: [row('moving', { projectId: 'q' })],
    }),
  );
  expect(next.mock.lastCall![0].coherent).toBe(true);
  expect(
    (await next.mock.lastCall![0].repository.readPage('alice', 100)).records,
  ).toEqual([]);
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice']))[0]
      .projectId,
  ).toBe('q');
  expect((await old.readPage('alice', 100)).records[0].projectId).toBe('p');
});
it('one revision updates facts and metadata together; removal/revocation cannot resurrect old rows', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  const stop = subscribePersonalReport(db, 'alice', next, fail, [], range);
  emit(
    state({
      projects: [project()],
      records: [row('closed', { endedAt: '2026-10-08T13:00:00Z' })],
    }),
  );
  const old = next.mock.lastCall![0].repository;
  emit(
    state({
      projects: [project('p', { topics: [{ id: 'new', title: 'New' }] })],
      records: [row('closed', { endedAt: '2026-10-08T14:00:00Z' })],
    }),
  );
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice']))[0].endedAt,
  ).toBe('2026-10-08T14:00:00Z');
  expect(
    await next.mock.lastCall![0].repository.readTopics(['p'], 'alice'),
  ).toEqual({ p: [{ id: 'new', title: 'New' }] });
  expect((await old.loadContext(['alice']))[0].endedAt).toBe(
    '2026-10-08T13:00:00Z',
  );
  emit(state());
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  const calls = next.mock.calls.length;
  stop();
  emit(state({ projects: [project()], records: [row('late')] }));
  expect(next).toHaveBeenCalledTimes(calls);
  expect(fail).not.toHaveBeenCalled();
});
it('reports synchronization errors instead of emitting silently partial calendar totals', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail, [], range);
  emit(state({ complete: false }));
  emit(state({ error: 'IndexedDB unavailable' }));
  expect(next).not.toHaveBeenCalled();
  expect(fail.mock.lastCall?.[0].message).toContain('IndexedDB');
});
