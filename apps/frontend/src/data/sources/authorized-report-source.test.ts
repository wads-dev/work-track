import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  nativeCache as mocks,
  project,
  row,
  state,
  flushCache,
} from '../repositories/firestore-report-fixture';
vi.mock(
  'firebase/firestore',
  async () =>
    (await import('../repositories/firestore-report-fixture')).nativeCache
      .firestore,
);
vi.mock('../sync/workspace-runtime', async () => ({
  observeWorkspace: (await import('../repositories/firestore-report-fixture'))
    .nativeCache.observe,
}));
vi.mock('firebase/functions', async () => ({
  httpsCallable: (await import('../repositories/firestore-report-fixture'))
    .nativeCache.callable,
}));
const db = mocks.db;
const emit = (value: Parameters<typeof mocks.emit>[0], index = 0) =>
  mocks.emit(value, index);
beforeEach(() => mocks.reset());
afterEach(() => {
  expect(mocks.onSnapshot).not.toHaveBeenCalled();
  expect(mocks.getDocs).not.toHaveBeenCalled();
  expect(mocks.getDocsFromServer).not.toHaveBeenCalled();
  expect(mocks.getDoc).not.toHaveBeenCalled();
  expect(mocks.callable).not.toHaveBeenCalled();
});

import { subscribeAuthorizedReport } from './authorized-report-source';
import { calendarQueryBounds } from './calendar-firestore-query';
import { reportRecordSchema } from '@work-track/data/codecs/report-record';
import { decodeWebProjectSnapshot } from '../../infrastructure/firebase/web-read-adapter';
const range = {
  from: '2026-10-08T00:00:00Z',
  to: '2026-10-09T00:00:00Z',
  projectId: 'p',
};
it('retains canonical calendar query bounds independently of local UI subscriptions', () => {
  expect(calendarQueryBounds(range)).toEqual({
    lower: '2026-10-06',
    upper: '2026-10-11',
  });
  expect(() =>
    calendarQueryBounds({ from: 'invalid', to: range.to }),
  ).toThrow();
});
it('decodes project snapshots synchronously without mutating raw data or SDK metadata', () => {
  const raw = {
    type: 'work',
    createdBy: 'alice',
    confidential: false,
    topics: [{ id: 't', title: 'Title', archived: false, custom: true }],
    archived: true,
    custom: { raw: true },
  };
  const snapshot = {
    data: vi.fn(() => raw),
    metadata: { fromCache: true, hasPendingWrites: true },
  };
  const decoded = decodeWebProjectSnapshot(snapshot, 'p', 'authorized-web');
  expect(decoded).toStrictEqual({
    type: 'work',
    createdBy: 'alice',
    archived: true,
    confidential: false,
    topics: [{ id: 't', title: 'Title', archived: false }],
  });
  expect(raw.custom).toEqual({ raw: true });
  expect(raw.topics[0].custom).toBe(true);
  expect(snapshot.data).toHaveBeenCalledOnce();
  expect(snapshot.metadata).toEqual({
    fromCache: true,
    hasPendingWrites: true,
  });
  expect(
    decodeWebProjectSnapshot({ data: () => undefined }, 'gone', 'personal-web'),
  ).toBeUndefined();
});
it('waits for complete atomic context and reports local errors without partial totals', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  await emit(
    state({ complete: false, projects: [project()], records: [row()] }),
  );
  expect(next).not.toHaveBeenCalled();
  expect(mocks.getDocsFromCache).not.toHaveBeenCalled();
  await emit(state({ error: 'permission-denied' }));
  expect(fail.mock.lastCall?.[0]).toBeInstanceOf(Error);
  expect(next).not.toHaveBeenCalled();
  await emit(state());
  expect(next.mock.lastCall?.[0]).toMatchObject({
    coherent: true,
    fromCache: false,
    hasPendingWrites: false,
  });
});
it('reuses the same content revision across metadata and audit events, including an in-flight catalog read', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const snapshot = {
    ...state({ projects: [project()], records: [row()] }),
    dataRevision: 1,
  };
  const pending = mocks.deferRead();
  await emit(snapshot);
  await emit({ ...snapshot, auditRevision: 2 });
  expect(mocks.getDocsFromCache).toHaveBeenCalledTimes(1);
  pending.release();
  await flushCache();
  expect(next).toHaveBeenCalledTimes(1);
  const repository = next.mock.lastCall![0].repository;
  await emit({ ...snapshot, auditRevision: 3 });
  expect(next.mock.lastCall![0].repository).toBe(repository);
  await emit({ ...snapshot, dataRevision: 2 });
  expect(next).toHaveBeenCalledTimes(2);
  await emit({ ...snapshot, dataRevision: 2, complete: false });
  await emit({ ...snapshot, dataRevision: 2 });
  expect(next).toHaveBeenCalledTimes(3);
  expect(fail).not.toHaveBeenCalled();
});
it('permits retry of the same revision after transient cache read failure', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const snapshot = { ...state({ projects: [project()] }), dataRevision: 1 };
  const pending = mocks.deferRead();
  await emit(snapshot);
  pending.reject(new Error('cache unavailable'));
  await flushCache();
  expect(fail).toHaveBeenCalledOnce();
  await emit(snapshot);
  expect(next).toHaveBeenCalledOnce();
});
it('rejects negative allocations without repairing authorized persisted facts', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const fact = row('r', {
    topics: [{ topicId: 't', percentage: -2, durationMinutes: -1 }],
  });
  await emit(state({ projects: [project()], records: [fact] }));
  await expect(
    next.mock.lastCall![0].repository.loadContext(['alice']),
  ).rejects.toThrow();
  expect(fact.data.topics).toEqual([
    { topicId: 't', percentage: -2, durationMinutes: -1 },
  ]);
  expect(fail).not.toHaveBeenCalled();
});
it.each([undefined, null, false, 0, {}, 'invalid'])(
  'invalid metadata type %s never becomes existing work',
  async (type) => {
    const next = vi.fn(),
      fail = vi.fn();
    subscribeAuthorizedReport(db, 'viewer', next, fail);
    await emit(state({ projects: [project('p', { type })], records: [row()] }));
    expect(next).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledOnce();
  },
);
it('keeps existing parents and excludes absent parents and tombstones before field validation', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  await emit(
    state({
      projects: [project('p', { type: 'work' })],
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
it.each(['projects/p/records/r', 'users/bob/records/r'])(
  'rejects queried invalid canonical path or owner %s rather than returning totals',
  async (path) => {
    const next = vi.fn(),
      fail = vi.fn();
    subscribeAuthorizedReport(db, 'viewer', next, fail);
    await emit(state({ projects: [project()], records: [{ ...row(), path }] }));
    await expect(
      next.mock.lastCall![0].repository.loadContext(['alice']),
    ).rejects.toThrow('canônico');
    expect(fail).not.toHaveBeenCalled();
  },
);
it('rejects malformed active records rather than silently dropping context', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  await emit(
    state({ projects: [project()], records: [row('bad', { startedAt: 42 })] }),
  );
  await expect(
    next.mock.lastCall![0].repository.loadContext(['alice']),
  ).rejects.toThrow();
  expect(fail).not.toHaveBeenCalled();
});
it('selects locally but preserves full global context and UID-qualified pagination', async () => {
  const next = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, vi.fn(), ['p'], range);
  await emit(
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
  const page = await repository.readPage(2, undefined, 'p', range);
  expect(page.records.map((r: { id: string }) => r.id)).toEqual([
    'overlap',
    'same',
  ]);
  expect(page.nextCursor).toBe('users/alice/records/same');
  expect(
    (await repository.readPage(2, page.nextCursor, 'p', range)).records,
  ).toEqual([expect.objectContaining({ uid: 'bob', id: 'same' })]);
});
it('keeps prior calculations immutable across updates and revocation', async () => {
  const next = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, vi.fn());
  await emit(
    state({
      projects: [project()],
      records: [row('r', { endedAt: '2026-10-08T13:00:00Z' })],
    }),
  );
  const old = next.mock.lastCall![0].repository;
  const oldContext = await old.loadContext(['alice']);
  await emit(
    state({
      projects: [project()],
      records: [row('r', { endedAt: '2026-10-08T14:00:00Z' })],
    }),
  );
  expect(oldContext[0].endedAt).toBe('2026-10-08T13:00:00Z');
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice']))[0].endedAt,
  ).toBe('2026-10-08T14:00:00Z');
  await emit(state({ records: [row()] }));
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
});
it('rejects oversized complete global context instead of returning partial totals', async () => {
  const next = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, vi.fn());
  await emit(
    state({
      projects: [project()],
      records: Array.from({ length: 2001 }, (_, i) => row(String(i))),
    }),
  );
  await expect(
    next.mock.lastCall![0].repository.loadContext(['alice']),
  ).rejects.toThrow('2000');
});
it('disposes a local observer without affecting concurrent subscriptions', async () => {
  const next = vi.fn(),
    other = vi.fn();
  const stop = subscribeAuthorizedReport(db, 'viewer', next, vi.fn());
  subscribeAuthorizedReport(db, 'other', other, vi.fn());
  stop();
  await emit(state());
  await emit(state(), 1);
  expect(next).not.toHaveBeenCalled();
  expect(other).toHaveBeenCalledOnce();
  expect(mocks.observers[0].stop).toHaveBeenCalledOnce();
});
it('recalculates every complete notification, including identical content and audit changes', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const complete = state({ projects: [project()], records: [row()] });
  await emit(complete);
  const repository = next.mock.lastCall![0].repository;
  await emit(structuredClone(complete));
  await emit(
    state({
      ...complete,
      projects: [project()],
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
  await emit(state({ complete: false, syncing: true }));
  await emit(structuredClone(complete));
  expect(next).toHaveBeenCalledTimes(4);
  expect(next.mock.lastCall![0].repository).not.toBe(repository);
  expect(await repository.loadContext(['alice'])).toHaveLength(1);
  expect(fail).not.toHaveBeenCalled();
});
it('reports every error and recalculates identical recovery content', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const complete = state({ projects: [project()], records: [row()] });
  await emit(complete);
  const repository = next.mock.lastCall![0].repository;
  await emit(state({ error: 'permission-denied' }));
  await emit(state({ error: 'permission-denied', audits: [] }));
  await emit(state({ complete: false }));
  await emit(state({ error: 'permission-denied' }));
  expect(fail).toHaveBeenCalledTimes(3);
  await emit(structuredClone(complete));
  expect(next).toHaveBeenCalledTimes(2);
  expect(next.mock.lastCall![0].repository).not.toBe(repository);
  await emit(structuredClone(complete));
  expect(next).toHaveBeenCalledTimes(3);
  await emit(state({ error: 'permission-denied' }));
  expect(fail).toHaveBeenCalledTimes(4);
});
it('reports each local failure and retries unchanged data without remote fallback', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const complete = state({ projects: [project()], records: [row()] });
  mocks.getDocsFromCache.mockRejectedValueOnce(new Error('cache-unavailable'));
  await emit(complete);
  mocks.getDocsFromCache.mockRejectedValueOnce(new Error('cache-unavailable'));
  await emit(complete);
  expect(fail).toHaveBeenCalledTimes(2);
  expect(next).not.toHaveBeenCalled();
  await emit(complete);
  expect(next).toHaveBeenCalledOnce();
});
it('publishes nested mutations with new repositories and immutable computed snapshots, including unselected global context', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail, [], {
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
    projectId: 'p',
  });
  const complete = state({
    projects: [
      project('p', { topics: [{ id: 't', title: 'Before', archived: false }] }),
      project('q'),
    ],
    records: [
      row('r', { topics: [{ topicId: 't', percentage: 50 }] }),
      row('budget', { projectId: 'q' }),
    ],
  });
  await emit(complete);
  const old = next.mock.lastCall![0].repository;
  const oldContext = await old.loadContext(['alice']);
  const oldTopics = await old.readTopics(['p']);
  (complete.projects[0].data.topics as { title: string }[])[0].title = 'After';
  (complete.records[0].data.topics as { percentage: number }[])[0].percentage =
    75;
  Object.assign(complete.records[1].data, { endedAt: '2026-10-08T14:00:00Z' });
  await emit(complete);
  const updated = next.mock.lastCall![0].repository;
  expect(next).toHaveBeenCalledTimes(2);
  expect(updated).not.toBe(old);
  expect(
    oldContext.find((r: { id: string }) => r.id === 'r')!.topics[0].percentage,
  ).toBe(50);
  expect(
    (await updated.loadContext(['alice'])).find(
      (r: { id: string }) => r.id === 'r',
    )!.topics[0].percentage,
  ).toBe(75);
  expect(oldTopics.p[0].title).toBe('Before');
  expect((await updated.readTopics(['p'])).p[0].title).toBe('After');
  expect(
    (await updated.loadContext(['alice'])).find(
      (r: { id: string }) => r.id === 'budget',
    )!.endedAt,
  ).toBe('2026-10-08T14:00:00Z');
  expect(fail).not.toHaveBeenCalled();
});

it('does not memoize over owner, tombstone or project access changes', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  await emit(state({ projects: [project()], records: [row('same')] }));
  await emit(
    state({ projects: [project()], records: [row('same', {}, 'bob')] }),
  );
  expect(next).toHaveBeenCalledTimes(2);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['bob']),
  ).toHaveLength(1);
  await emit(
    state({
      projects: [project()],
      records: [row('same', { deletedAt: 'removed' }, 'bob')],
    }),
  );
  expect(next).toHaveBeenCalledTimes(3);
  expect(await next.mock.lastCall![0].repository.loadContext(['bob'])).toEqual(
    [],
  );
  await emit(
    state({ projects: [project()], records: [row('same', {}, 'bob')] }),
  );
  await emit(
    state({
      projects: [project('p', { type: 'personal', createdBy: 'bob' })],
      records: [row('same', {}, 'bob')],
    }),
  );
  expect(next).toHaveBeenCalledTimes(5);
  expect(await next.mock.lastCall![0].repository.loadContext(['bob'])).toEqual(
    [],
  );
  await emit(state({ records: [row('same', {}, 'bob')] }));
  expect(next).toHaveBeenCalledTimes(6);
  expect(fail).not.toHaveBeenCalled();
});

it('awaits native catalog readiness and ignores obsolete generations and disposal', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  const stop = subscribeAuthorizedReport(db, 'viewer', next, fail);
  const obsolete = mocks.deferRead();
  await emit(state({ projects: [project('old')] }));
  expect(next).not.toHaveBeenCalled();
  await emit(state({ projects: [project('current')] }));
  expect([...next.mock.lastCall![0].repository.projects.keys()]).toEqual([
    'current',
  ]);
  obsolete.release();
  await flushCache();
  expect(next).toHaveBeenCalledOnce();
  const late = mocks.deferRead();
  await emit(state({ projects: [project('late')] }));
  stop();
  late.release();
  await flushCache();
  expect(next).toHaveBeenCalledOnce();
  expect(fail).not.toHaveBeenCalled();
});
it('does not publish or report a catalog failure from a superseded generation', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  const obsolete = mocks.deferRead();
  await emit(state({ projects: [project('old')] }));
  await emit(state({ projects: [project('current')] }));
  obsolete.reject(new Error('obsolete-cache-error'));
  await flushCache();
  expect(next).toHaveBeenCalledOnce();
  expect(fail).not.toHaveBeenCalled();
});

it.each(['endedAt', 'deletedAt', 'topics'])(
  'rejects missing authorized storage %s instead of supplying defaults',
  (field) => {
    const fact = row();
    delete fact.data[field];
    expect(() =>
      reportRecordSchema('authorized-web').parse(fact.data),
    ).toThrow();
    expect(fact.data).not.toHaveProperty(field);
  },
);
it.each(['type', 'archived', 'confidential', 'topics'])(
  'rejects missing authorized project %s without publishing a repaired catalog',
  async (field) => {
    const next = vi.fn(),
      fail = vi.fn();
    const parent = project();
    delete (parent.data as Record<string, unknown>)[field];
    subscribeAuthorizedReport(db, 'viewer', next, fail);
    await emit(state({ projects: [parent], records: [row()] }));
    expect(next).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledOnce();
    expect(parent.data).not.toHaveProperty(field);
  },
);
it('rejects missing topic archived metadata without supplying false', () => {
  const raw = project('p', { topics: [{ id: 't', title: 'Title' }] }).data;
  expect(() =>
    decodeWebProjectSnapshot({ data: () => raw }, 'p', 'authorized-web'),
  ).toThrow();
  expect(raw.topics).toEqual([{ id: 't', title: 'Title' }]);
});
