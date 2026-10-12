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

import { subscribePersonalReport } from './personal-report-source';

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

it('uses personal codecs: null topics default, record extras stripped, topic extras retained individually', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail);
  const topic = {
    id: 't',
    title: 'Title',
    mergedIntoTopicId: 42,
    custom: 'retained',
  };
  const fact = row('r', { topics: null, originalText: 'private' });
  emit(
    state({
      projects: [
        project('p', {
          archived: 'legacy',
          topics: [topic, null, { id: 'bad' }],
          custom: 'strip',
        }),
      ],
      records: [fact],
    }),
  );
  const repository = next.mock.lastCall![0].repository;
  expect(await repository.loadContext(['alice'])).toEqual([
    expect.objectContaining({ uid: 'alice', topics: [] }),
  ]);
  expect((await repository.loadContext(['alice']))[0].endedAt).toBeUndefined();
  expect((await repository.loadContext(['alice']))[0]).not.toHaveProperty(
    'originalText',
  );
  expect(await repository.readTopics(['p'], 'alice')).toEqual({ p: [topic] });
  expect(await repository.archivedProjectIds(['p'])).toEqual(['p']);
  expect(fact.data.topics).toBeNull();
  expect(fail).not.toHaveBeenCalled();
});
it.each([
  { topics: [{ topicId: 't', percentage: -1 }] },
  { topics: [{ topicId: 't', durationMinutes: Infinity }] },
  { topics: [{ topicId: 't', percentage: NaN }] },
  { projectId: 'nested/project' },
])(
  'rejects malformed personal facts without repairing persisted data: %s',
  (patch) => {
    const next = vi.fn(),
      fail = vi.fn();
    subscribePersonalReport(db, 'alice', next, fail);
    const fact = row('r', patch);
    emit(
      state({
        projects: [project(), project('nested/project')],
        records: [fact],
      }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(fail.mock.lastCall?.[0]).toBeInstanceOf(Error);
    expect(fact.data).toMatchObject(patch);
  },
);
it.each([null, false, 0, {}, 'invalid'])(
  'invalid personal metadata type %s remains inaccessible',
  async (type) => {
    const next = vi.fn(),
      fail = vi.fn();
    subscribePersonalReport(db, 'alice', next, fail);
    emit(state({ projects: [project('p', { type })], records: [row()] }));
    expect(
      await next.mock.lastCall![0].repository.loadContext(['alice']),
    ).toEqual([]);
    expect(fail).not.toHaveBeenCalled();
  },
);
it('excludes tombstones before validation and isolates personal ownership and authenticated reader', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail);
  emit(
    state({
      projects: [
        project(),
        project('own', { type: 'personal', createdBy: 'alice' }),
        project('foreign', { type: 'personal', createdBy: 'bob' }),
      ],
      records: [
        row('own', { projectId: 'own' }),
        row('work'),
        row('foreign', { projectId: 'foreign' }),
        row('other', {}, 'bob'),
        row('deleted', { deletedAt: 'legacy', topics: 'invalid' }),
      ],
    }),
  );
  const repository = next.mock.lastCall![0].repository;
  expect(
    (await repository.loadContext(['alice'])).map((r: { id: string }) => r.id),
  ).toEqual(['own', 'work']);
  await expect(repository.loadContext(['bob'])).rejects.toThrow('owner');
  expect(await repository.readPersonalProject('own', 'alice')).not.toBeNull();
  expect(await repository.readPersonalProject('foreign', 'alice')).toBeNull();
  expect(await repository.readTopics(['foreign'], 'alice')).toEqual({
    foreign: [],
  });
  expect(fail).not.toHaveBeenCalled();
});
it('waits for complete local state, updates atomically, removes revoked parents and keeps snapshots immutable', async () => {
  const next = vi.fn();
  subscribePersonalReport(db, 'alice', next, vi.fn());
  emit(state({ complete: false, records: [row()] }));
  expect(next).not.toHaveBeenCalled();
  emit(
    state({ projects: [project()], records: [row('r', { endedAt: null })] }),
  );
  const old = next.mock.lastCall![0].repository;
  expect(next.mock.lastCall![0]).toMatchObject({
    coherent: true,
    fromCache: false,
    hasPendingWrites: false,
  });
  emit(
    state({
      projects: [project()],
      records: [row('r', { endedAt: '2026-10-08T13:00:00Z' })],
    }),
  );
  expect((await old.loadContext(['alice']))[0].endedAt).toBeUndefined();
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice']))[0].endedAt,
  ).toBe('2026-10-08T13:00:00Z');
  emit(state());
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
});
it('pages locally while preserving every own context record including other projects and archived history', async () => {
  const next = vi.fn();
  subscribePersonalReport(db, 'alice', next, vi.fn(), ['p'], {
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
    projectId: 'p',
  });
  emit(
    state({
      projects: [project(), project('q', { archived: true })],
      records: [
        row('b'),
        row('a'),
        row('budget', { projectId: 'q', startedAt: '2026-01-01T00:00:00Z' }),
        row('b', {}, 'bob'),
      ],
    }),
  );
  const repository = next.mock.lastCall![0].repository;
  expect(await repository.loadContext(['alice'])).toHaveLength(3);
  const first = await repository.readPage('alice', 1);
  expect(first.records[0].id).toBe('a');
  expect(first.nextCursor).toBe('a');
  const second = await repository.readPage('alice', 1, first.nextCursor);
  expect(second.records[0].id).toBe('b');
  expect(second.nextCursor).toBeNull();
  expect(await repository.archivedProjectIds(['q', 'gone'])).toEqual([
    'q',
    'gone',
  ]);
});
it('rejects oversized global context instead of reporting partial personal totals', async () => {
  const next = vi.fn();
  subscribePersonalReport(db, 'alice', next, vi.fn());
  emit(
    state({
      projects: [project()],
      records: Array.from({ length: 2001 }, (_, i) => row(String(i))),
    }),
  );
  await expect(
    next.mock.lastCall![0].repository.loadContext(['alice']),
  ).rejects.toThrow('2000');
});
it('forwards local errors and releases the observer without remote fallback or late updates', () => {
  const next = vi.fn(),
    fail = vi.fn();
  const stop = subscribePersonalReport(db, 'alice', next, fail);
  emit(state({ error: 'permission-denied' }));
  expect(fail.mock.lastCall?.[0].message).toContain('permission-denied');
  expect(next).not.toHaveBeenCalled();
  stop();
  emit(state({ projects: [project()], records: [row()] }));
  expect(next).not.toHaveBeenCalled();
  expect(mocks.observers[0].stop).toHaveBeenCalledOnce();
});
