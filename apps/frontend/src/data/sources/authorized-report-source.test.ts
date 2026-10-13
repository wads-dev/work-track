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

import {
  authorizedRecordQueries,
  subscribeAuthorizedReport,
} from './authorized-report-source';
import { decodeWebProjectSnapshot } from '../../infrastructure/firebase/web-read-adapter';
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
it('retains the exported query builder independently of local UI subscriptions', () => {
  expect(authorizedRecordQueries(db, 'p')).toEqual([
    {
      base: { group: 'records' },
      constraints: [{ field: 'projectId', op: '==', value: 'p' }],
    },
  ]);
  const queries = authorizedRecordQueries(db, 'p', range) as unknown as {
    constraints: unknown[];
  }[];
  expect(queries).toHaveLength(2);
  for (const q of queries) {
    expect(q.constraints).toContainEqual({
      field: 'projectId',
      op: '==',
      value: 'p',
    });
    expect(q.constraints).toContainEqual({
      field: 'startedAt',
      op: '<',
      value: '2026-10-11',
    });
  }
  expect(queries[0].constraints).toContainEqual({
    field: 'startedAt',
    op: '>=',
    value: '2026-10-06',
  });
  expect(queries[1].constraints).toContainEqual({
    field: 'endedAt',
    op: '>=',
    value: '2026-10-06',
  });
  expect(() =>
    authorizedRecordQueries(db, 'p', { from: 'invalid', to: range.to }),
  ).toThrow();
});
it('decodes project snapshots synchronously without mutating raw data or SDK metadata', () => {
  const raw = {
    type: 'work',
    topics: [{ id: 't', title: 'Title', custom: true }, null],
    archived: 'legacy',
    custom: { raw: true },
  };
  const snapshot = {
    data: vi.fn(() => raw),
    metadata: { fromCache: true, hasPendingWrites: true },
  };
  expect(
    decodeWebProjectSnapshot(snapshot, 'p', 'authorized-web'),
  ).toMatchObject(raw);
  expect(snapshot.data).toHaveBeenCalledOnce();
  expect(snapshot.metadata).toEqual({
    fromCache: true,
    hasPendingWrites: true,
  });
  expect(
    decodeWebProjectSnapshot({ data: () => undefined }, 'gone', 'personal-web'),
  ).toBeUndefined();
});
it('waits for complete atomic context and reports local errors without partial totals', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  emit(state({ complete: false, projects: [project()], records: [row()] }));
  expect(next).not.toHaveBeenCalled();
  emit(state({ error: 'permission-denied' }));
  expect(fail.mock.lastCall?.[0]).toBeInstanceOf(Error);
  expect(next).not.toHaveBeenCalled();
  emit(state());
  expect(next.mock.lastCall?.[0]).toMatchObject({
    coherent: true,
    fromCache: false,
    hasPendingWrites: false,
  });
});
it('retains authorized raw extras and permissive negative legacy allocations', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const topic = {
    id: 't',
    title: 'Title',
    mergedIntoTopicId: 42,
    custom: 'retained',
  };
  const fact = row('r', {
    topics: [{ topicId: 't', percentage: -2, durationMinutes: -1 }],
    originalText: 'legacy-extra',
  });
  emit(
    state({
      projects: [
        project('p', {
          topics: [topic],
          archived: 'legacy',
          custom: { raw: true },
        }),
      ],
      records: [fact],
    }),
  );
  const repository = next.mock.lastCall![0].repository;
  expect(repository.projects.get('p')).toMatchObject({
    topics: [topic],
    archived: 'legacy',
    custom: { raw: true },
  });
  expect(await repository.loadContext(['alice'])).toEqual([
    expect.objectContaining({
      topics: [{ topicId: 't', percentage: -2, durationMinutes: -1 }],
      originalText: 'legacy-extra',
    }),
  ]);
  expect((await repository.loadContext(['alice']))[0].endedAt).toBeUndefined();
  expect(await repository.userLabels(['alice', 'viewer'])).toEqual({
    alice: 'alice',
    viewer: 'Você',
  });
  expect(fact.data.topics).toEqual([
    { topicId: 't', percentage: -2, durationMinutes: -1 },
  ]);
  expect(fail).not.toHaveBeenCalled();
});
it.each([null, false, 0, {}, 'invalid'])(
  'invalid metadata type %s never becomes legacy work',
  async (type) => {
    const next = vi.fn();
    subscribeAuthorizedReport(db, 'viewer', next, vi.fn());
    emit(state({ projects: [project('p', { type })], records: [row()] }));
    expect(
      await next.mock.lastCall![0].repository.loadContext(['alice']),
    ).toEqual([]);
  },
);
it('keeps legacy parents and excludes absent parents and tombstones before field validation', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  emit(
    state({
      projects: [project('p', { type: undefined })],
      records: [
        row('live', { deletedAt: null }),
        row('deleted', { deletedAt: false, topics: 'invalid' }),
        row('orphan', { projectId: 'gone', topics: 'invalid' }),
      ],
    }),
  );
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice'])).map(
      (r: { id: string }) => r.id,
    ),
  ).toEqual(['live']);
  expect(fail).not.toHaveBeenCalled();
});
it.each([
  'users/alice/records/r/extra',
  'projects/p/records/r',
  'users/bob/records/r',
])('rejects invalid canonical path or owner %s without publishing', (path) => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  emit(state({ projects: [project()], records: [{ ...row(), path }] }));
  expect(next).not.toHaveBeenCalled();
  expect(fail).toHaveBeenCalledOnce();
});
it('rejects malformed active records rather than silently dropping context', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  emit(
    state({ projects: [project()], records: [row('bad', { startedAt: 42 })] }),
  );
  expect(next).not.toHaveBeenCalled();
  expect(fail).toHaveBeenCalledOnce();
});
it('selects locally but preserves full global context and UID-qualified pagination', async () => {
  const next = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, vi.fn(), ['p'], range);
  emit(
    state({
      projects: [project(), project('q')],
      records: [
        row('same'),
        row('same', {}, 'bob'),
        row('budget', { projectId: 'q', startedAt: '2026-01-01T00:00:00Z' }),
        row('overlap', {
          startedAt: '2026-01-01T00:00:00Z',
          endedAt: '2026-10-08T13:00:00Z',
        }),
      ],
    }),
  );
  const repository = next.mock.lastCall![0].repository;
  expect(await repository.loadContext(['alice'])).toHaveLength(3);
  const page = await repository.readPage(2);
  expect(page.records.map((r: { id: string }) => r.id)).toEqual([
    'overlap',
    'same',
  ]);
  expect(page.nextCursor).toBe('users/alice/records/same');
  expect((await repository.readPage(2, page.nextCursor)).records).toEqual([
    expect.objectContaining({ uid: 'bob', id: 'same' }),
  ]);
});
it('keeps prior calculations immutable across updates and revocation', async () => {
  const next = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, vi.fn());
  emit(
    state({
      projects: [project()],
      records: [row('r', { endedAt: '2026-10-08T13:00:00Z' })],
    }),
  );
  const old = next.mock.lastCall![0].repository;
  emit(
    state({
      projects: [project()],
      records: [row('r', { endedAt: '2026-10-08T14:00:00Z' })],
    }),
  );
  expect((await old.loadContext(['alice']))[0].endedAt).toBe(
    '2026-10-08T13:00:00Z',
  );
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice']))[0].endedAt,
  ).toBe('2026-10-08T14:00:00Z');
  emit(state({ records: [row()] }));
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
});
it('rejects oversized complete global context instead of returning partial totals', async () => {
  const next = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, vi.fn());
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
it('disposes a local observer without affecting concurrent subscriptions', () => {
  const next = vi.fn(),
    other = vi.fn();
  const stop = subscribeAuthorizedReport(db, 'viewer', next, vi.fn());
  subscribeAuthorizedReport(db, 'other', other, vi.fn());
  stop();
  emit(state());
  emit(state(), 1);
  expect(next).not.toHaveBeenCalled();
  expect(other).toHaveBeenCalledOnce();
  expect(mocks.observers[0].stop).toHaveBeenCalledOnce();
});
it('does not publish duplicate content, audit-only changes or incomplete refreshes', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const complete = state({ projects: [project()], records: [row()] });
  emit(complete);
  const repository = next.mock.lastCall![0].repository;
  emit(structuredClone(complete));
  emit(
    state({
      ...complete,
      projects: [{ id: 'p', data: { topics: [], type: 'work' } }],
      records: [
        {
          path: row().path,
          data: Object.fromEntries(Object.entries(row().data).reverse()),
        },
      ],
      audits: [
        { path: 'projects/p/auditEvents/a', data: { action: 'updated' } },
      ],
      syncing: true,
      completedProjects: ['p'],
    }),
  );
  emit(state({ complete: false, syncing: true }));
  emit(structuredClone(complete));
  expect(next).toHaveBeenCalledOnce();
  expect(next.mock.lastCall![0].repository).toBe(repository);
  expect(await repository.loadContext(['alice'])).toHaveLength(1);
  expect(fail).not.toHaveBeenCalled();
});
it('fails once per repeated error and publishes identical recovery content', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const complete = state({ projects: [project()], records: [row()] });
  emit(complete);
  const repository = next.mock.lastCall![0].repository;
  emit(state({ error: 'permission-denied' }));
  emit(state({ error: 'permission-denied', audits: [] }));
  emit(state({ complete: false }));
  emit(state({ error: 'permission-denied' }));
  expect(fail).toHaveBeenCalledOnce();
  emit(structuredClone(complete));
  expect(next).toHaveBeenCalledTimes(2);
  expect(next.mock.lastCall![0].repository).not.toBe(repository);
  emit(structuredClone(complete));
  expect(next).toHaveBeenCalledTimes(2);
  emit(state({ error: 'permission-denied' }));
  expect(fail).toHaveBeenCalledTimes(2);
});
it('deduplicates invalid content errors and recovers even when valid data is unchanged', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const complete = state({ projects: [project()], records: [row()] });
  emit(complete);
  const invalid = state({
    projects: [project()],
    records: [row('r', { startedAt: 42 })],
  });
  emit(invalid);
  emit(structuredClone(invalid));
  expect(fail).toHaveBeenCalledOnce();
  emit(structuredClone(complete));
  expect(next).toHaveBeenCalledTimes(2);
});
it('publishes nested mutations with new immutable repositories, including unselected global context', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail, [], {
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
    projectId: 'p',
  });
  const complete = state({
    projects: [
      project('p', { topics: [{ id: 't', title: 'Before' }] }),
      project('q'),
    ],
    records: [
      row('r', { topics: [{ topicId: 't', percentage: 50 }] }),
      row('budget', { projectId: 'q' }),
    ],
  });
  emit(complete);
  const old = next.mock.lastCall![0].repository;
  (complete.projects[0].data.topics as { title: string }[])[0].title = 'After';
  (complete.records[0].data.topics as { percentage: number }[])[0].percentage =
    75;
  Object.assign(complete.records[1].data, { endedAt: '2026-10-08T14:00:00Z' });
  emit(complete);
  const updated = next.mock.lastCall![0].repository;
  expect(next).toHaveBeenCalledTimes(2);
  expect(updated).not.toBe(old);
  expect((await old.loadContext(['alice']))[0].topics[0].percentage).toBe(50);
  expect((await updated.loadContext(['alice']))[0].topics[0].percentage).toBe(
    75,
  );
  expect((await old.readTopics(['p'])).p[0].title).toBe('Before');
  expect((await updated.readTopics(['p'])).p[0].title).toBe('After');
  expect((await updated.loadContext(['alice']))[1].endedAt).toBe(
    '2026-10-08T14:00:00Z',
  );
  expect(fail).not.toHaveBeenCalled();
});

it('does not memoize over owner, tombstone or project access changes', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  emit(state({ projects: [project()], records: [row('same')] }));
  emit(state({ projects: [project()], records: [row('same', {}, 'bob')] }));
  expect(next).toHaveBeenCalledTimes(2);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['bob']),
  ).toHaveLength(1);
  emit(
    state({
      projects: [project()],
      records: [row('same', { deletedAt: 'removed' }, 'bob')],
    }),
  );
  expect(next).toHaveBeenCalledTimes(3);
  expect(await next.mock.lastCall![0].repository.loadContext(['bob'])).toEqual(
    [],
  );
  emit(state({ projects: [project()], records: [row('same', {}, 'bob')] }));
  emit(
    state({
      projects: [project('p', { type: 'personal', createdBy: 'bob' })],
      records: [row('same', {}, 'bob')],
    }),
  );
  expect(next).toHaveBeenCalledTimes(5);
  expect(await next.mock.lastCall![0].repository.loadContext(['bob'])).toEqual(
    [],
  );
  emit(state({ records: [row('same', {}, 'bob')] }));
  expect(next).toHaveBeenCalledTimes(6);
  expect(fail).not.toHaveBeenCalled();
});
