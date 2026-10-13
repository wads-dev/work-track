import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  nativeCache as mocks,
  project,
  row,
  state,
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
const emit = (value: Parameters<typeof mocks.emit>[0]) => mocks.emit(value);
beforeEach(() => mocks.reset());
afterEach(() => {
  expect(mocks.onSnapshot).not.toHaveBeenCalled();
  expect(mocks.getDocs).not.toHaveBeenCalled();
  expect(mocks.getDocsFromServer).not.toHaveBeenCalled();
  expect(mocks.getDoc).not.toHaveBeenCalled();
  expect(mocks.callable).not.toHaveBeenCalled();
});

import { subscribePersonalReport } from './personal-report-source';
import { decodePersonalReportRecord } from '@work-track/data/codecs/report-record';

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
  await emit(
    state({
      projects: [
        project('p', {
          archived: 'existing',
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
])(
  'rejects malformed personal facts without repairing persisted data: %s',
  async (patch) => {
    const next = vi.fn(),
      fail = vi.fn();
    subscribePersonalReport(db, 'alice', next, fail);
    const fact = row('r', patch);
    await emit(
      state({
        projects: [project(), project('nested/project')],
        records: [fact],
      }),
    );
    await expect(
      next.mock.lastCall![0].repository.loadContext(['alice']),
    ).rejects.toThrow();
    expect(fail).not.toHaveBeenCalled();
    expect(fact.data).toMatchObject(patch);
  },
);
it.each([null, false, 0, {}, 'invalid'])(
  'invalid personal metadata type %s remains inaccessible',
  async (type) => {
    const next = vi.fn(),
      fail = vi.fn();
    subscribePersonalReport(db, 'alice', next, fail);
    await emit(state({ projects: [project('p', { type })], records: [row()] }));
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
  await emit(
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
        row('deleted', { deletedAt: 'existing', topics: 'invalid' }),
      ],
    }),
  );
  const repository = next.mock.lastCall![0].repository;
  expect(
    (await repository.loadContext(['alice'])).map((r: { id: string }) => r.id),
  ).toEqual(['own', 'work']);
  await expect(repository.loadContext(['bob'])).rejects.toThrow('Visualizador');
  expect(
    (
      await repository.readPage('alice', 100, undefined, {
        projectId: 'own',
        includeArchived: true,
      })
    ).records,
  ).toHaveLength(1);
  expect(
    (
      await repository.readPage('alice', 100, undefined, {
        projectId: 'foreign',
        includeArchived: true,
      })
    ).records,
  ).toEqual([]);
  expect(await repository.readTopics(['foreign'], 'alice')).toEqual({
    foreign: [],
  });
  expect(fail).not.toHaveBeenCalled();
});
it('waits for complete local state, updates atomically, removes revoked parents and keeps computed snapshots immutable', async () => {
  const next = vi.fn();
  subscribePersonalReport(db, 'alice', next, vi.fn());
  await emit(state({ complete: false, records: [row()] }));
  expect(next).not.toHaveBeenCalled();
  await emit(
    state({ projects: [project()], records: [row('r', { endedAt: null })] }),
  );
  const old = next.mock.lastCall![0].repository;
  const oldContext = await old.loadContext(['alice']);
  expect(next.mock.lastCall![0]).toMatchObject({
    coherent: true,
    fromCache: false,
    hasPendingWrites: false,
  });
  await emit(
    state({
      projects: [project()],
      records: [row('r', { endedAt: '2026-10-08T13:00:00Z' })],
    }),
  );
  expect(oldContext[0].endedAt).toBeUndefined();
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice']))[0].endedAt,
  ).toBe('2026-10-08T13:00:00Z');
  await emit(state());
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
  await emit(
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
  const first = await repository.readPage('alice', 1, undefined, {
    projectId: 'p',
    includeArchived: true,
  });
  expect(first.records[0].id).toBe('a');
  expect(first.nextCursor).toBe('users/alice/records/a');
  const second = await repository.readPage('alice', 1, first.nextCursor, {
    projectId: 'p',
    includeArchived: true,
  });
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
it('forwards local errors and releases the observer without remote fallback or late updates', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  const stop = subscribePersonalReport(db, 'alice', next, fail);
  await emit(state({ error: 'permission-denied' }));
  expect(fail.mock.lastCall?.[0].message).toContain('permission-denied');
  expect(next).not.toHaveBeenCalled();
  stop();
  await emit(state({ projects: [project()], records: [row()] }));
  expect(next).not.toHaveBeenCalled();
  expect(mocks.observers[0].stop).toHaveBeenCalledOnce();
});
it('does not publish duplicate content, audit-only changes or incomplete refreshes', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail);
  const complete = state({ projects: [project()], records: [row()] });
  await emit(complete);
  const repository = next.mock.lastCall![0].repository;
  await emit(structuredClone(complete));
  await emit(
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
  await emit(state({ complete: false, syncing: true }));
  await emit(structuredClone(complete));
  expect(next).toHaveBeenCalledOnce();
  expect(next.mock.lastCall![0].repository).toBe(repository);
  expect(await repository.loadContext(['alice'])).toHaveLength(1);
  expect(fail).not.toHaveBeenCalled();
});
it('fails once per repeated error and publishes identical recovery content', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail);
  const complete = state({ projects: [project()], records: [row()] });
  await emit(complete);
  const repository = next.mock.lastCall![0].repository;
  await emit(state({ error: 'permission-denied' }));
  await emit(state({ error: 'permission-denied', audits: [] }));
  await emit(state({ complete: false }));
  await emit(state({ error: 'permission-denied' }));
  expect(fail).toHaveBeenCalledOnce();
  await emit(structuredClone(complete));
  expect(next).toHaveBeenCalledTimes(2);
  expect(next.mock.lastCall![0].repository).not.toBe(repository);
  await emit(structuredClone(complete));
  expect(next).toHaveBeenCalledTimes(2);
  await emit(state({ error: 'permission-denied' }));
  expect(fail).toHaveBeenCalledTimes(2);
});
it('retries failed native catalog reads and recovers unchanged valid content', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail);
  const complete = state({ projects: [project()], records: [row()] });
  mocks.getDocsFromCache.mockRejectedValueOnce(new Error('cache unavailable'));
  await emit(complete);
  expect(fail).toHaveBeenCalledOnce();
  expect(next).not.toHaveBeenCalled();
  await emit(complete);
  expect(next).toHaveBeenCalledOnce();
});
it('publishes nested mutations with new repositories and immutable computed snapshots, including unselected global context', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail, [], {
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
  await emit(complete);
  const old = next.mock.lastCall![0].repository;
  const oldContext = await old.loadContext(['alice']);
  const oldTopics = await old.readTopics(['p'], 'alice');
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
  expect((await updated.readTopics(['p'], 'alice')).p[0].title).toBe('After');
  expect(
    (await updated.loadContext(['alice'])).find(
      (r: { id: string }) => r.id === 'budget',
    )!.endedAt,
  ).toBe('2026-10-08T14:00:00Z');
  expect(fail).not.toHaveBeenCalled();
});

it('does not memoize over ownership, tombstone or personal ACL changes', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail);
  const own = project('p', { type: 'personal', createdBy: 'alice' });
  await emit(state({ projects: [own], records: [row('same')] }));
  await emit(state({ projects: [own], records: [row('same', {}, 'bob')] }));
  expect(next).toHaveBeenCalledTimes(2);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  await emit(state({ projects: [own], records: [row('same')] }));
  await emit(
    state({
      projects: [own],
      records: [row('same', { deletedAt: 'removed' })],
    }),
  );
  expect(next).toHaveBeenCalledTimes(4);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  await emit(state({ projects: [own], records: [row('same')] }));
  await emit(
    state({
      projects: [project('p', { type: 'personal', createdBy: 'bob' })],
      records: [row('same')],
    }),
  );
  expect(next).toHaveBeenCalledTimes(6);
  expect(
    (
      await next.mock.lastCall![0].repository.readPage(
        'alice',
        100,
        undefined,
        { projectId: 'p', includeArchived: true },
      )
    ).records,
  ).toEqual([]);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  expect(fail).not.toHaveBeenCalled();
});

it('rejects path-injected personal project identities without repairing persisted data', () => {
  // Such an invalid parent cannot exist in a native top-level projects query;
  // retain the reader codec regression independently from query accessibility.
  const fact = row('r', { projectId: 'nested/project' });
  expect(() => decodePersonalReportRecord(fact.data, 'r', 'alice')).toThrow(
    'inválido',
  );
  expect(fact.data.projectId).toBe('nested/project');
});
