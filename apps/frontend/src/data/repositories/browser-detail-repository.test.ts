import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import type { WorkspaceSnapshot } from '../sync/workspace-sync';
import { deletionRevision } from '../cache/record-deletion';
const mocks = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  reads: vi.fn(),
  queries: vi.fn(),
  observers: [] as ((state: WorkspaceSnapshot) => void)[],
  audits: [] as { path: string; next: (state: WorkspaceSnapshot) => void }[],
  stop: vi.fn(),
  remote: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => path,
  collection: (_db: unknown, path: string) => path,
  documentId: () => '__name__',
  orderBy: (field: string) => ({ order: field }),
  limit: (count: number) => ({ limit: count }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (path: string, ...clauses: unknown[]) => ({ path, clauses }),
  getDocFromCache: mocks.reads,
  getDocsFromCache: mocks.queries,
  getDoc: mocks.remote,
  getDocs: mocks.remote,
  onSnapshot: mocks.remote,
}));
vi.mock('../sync/workspace-runtime', () => ({
  observeWorkspace: (
    _db: unknown,
    _uid: string,
    next: (state: WorkspaceSnapshot) => void,
  ) => {
    mocks.observers.push(next);
    return mocks.stop;
  },
  observeWorkspaceAudit: (
    _db: unknown,
    _uid: string,
    path: string,
    next: (state: WorkspaceSnapshot) => void,
  ) => {
    mocks.audits.push({ path, next });
    return mocks.stop;
  },
}));
import {
  BrowserDetailRepository,
  descriptionKey,
  observeRecordAudit,
  observeRecordDetail,
} from './browser-detail-repository';
const db = {} as Firestore;
const work = {
  createdBy: 'me',
  archived: false,
  confidential: false,
  type: 'work',
  title: 'Public',
  topics: [],
};
const record = {
  endedAt: null,
  deletedAt: null,
  uid: 'me',
  projectId: 'p',
  interpretation: 'Current description',
};
const snapshot = (
  patch: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot => ({
  projects: [{ id: 'p', data: work }],
  records: [],
  complete: true,
  syncing: false,
  error: '',
  ...patch,
  completedProjects: patch.projects?.map((p) => p.id) ?? ['p'],
});
const repository = (ids = ['p']) =>
  new BrowserDetailRepository(db, 'me', new Set(ids));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.documents.clear();
  mocks.observers.splice(0);
  mocks.audits.splice(0);
  mocks.documents.set('projects/p', work);
  mocks.documents.set('users/me/records/r', record);
  mocks.reads.mockImplementation(async (path: string) => ({
    exists: () => mocks.documents.has(path),
    data: () => mocks.documents.get(path),
  }));
  mocks.queries.mockImplementation(
    async (target: {
      path: string;
      clauses: { value?: string[]; order?: string; limit?: number }[];
    }) => {
      const ids = target.clauses.find((clause) => clause.value)?.value;
      const max =
        target.clauses.find((clause) => clause.limit)?.limit ?? Infinity;
      const docs = [...mocks.documents]
        .filter(
          ([path]) =>
            path.startsWith(target.path + '/') &&
            path.split('/').length === target.path.split('/').length + 1,
        )
        .filter(([path]) => !ids || ids.includes(path.split('/').at(-1)!))
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, max)
        .map(([path, data]) => ({
          id: path.split('/').at(-1)!,
          data: () => data,
        }));
      return { docs, size: docs.length };
    },
  );
});
it('reads native uid/id detail and rechecks current project ACL, not a record snapshot', async () => {
  expect(await repository().readRecordDetail('me', 'r')).toEqual(record);
  expect(mocks.reads.mock.calls.map((call) => call[0])).toEqual([
    'users/me/records/r',
    'projects/p',
  ]);
  mocks.documents.set('projects/p', {
    ...work,
    type: 'personal',
    createdBy: 'other',
  });
  expect(await repository().readRecordDetail('me', 'r')).toBeNull();
  expect(mocks.remote).not.toHaveBeenCalled();
});
it('rejects owner mismatch, wrong project, tombstones and foreign private records', async () => {
  for (const data of [
    { ...record, uid: 'other' },
    { ...record, deletedAt: 'now' },
  ]) {
    mocks.documents.set('users/me/records/r', data);
    expect(await repository().readRecordDetail('me', 'r')).toBeNull();
  }
  mocks.documents.set('users/me/records/r', record);
  expect(await repository().readRecordDetail('me', 'r', 'another')).toBeNull();
  mocks.documents.set('users/other/records/r', { ...record, uid: 'other' });
  mocks.documents.set('projects/p', {
    ...work,
    type: 'personal',
    createdBy: 'me',
  });
  expect(await repository().readRecordDetail('other', 'r')).toBeNull();
  expect(await repository([]).readRecordDetail('me', 'r')).toBeNull();
  expect(await repository().readRecordDetail('me', '../r')).toBeNull();
});
it('keeps duplicate record IDs isolated by owner and selected project for descriptions', async () => {
  mocks.documents.set('users/other/records/r', {
    ...record,
    uid: 'other',
    interpretation: 'Other author',
  });
  const descriptions = await repository().readDescriptions([
    { id: 'r', projectId: 'p' },
    { id: 'r', uid: 'other', projectId: 'p' },
  ]);
  expect(
    descriptions.get(descriptionKey({ id: 'r' }, 'me'))?.interpretation,
  ).toBe('Current description');
  expect(
    descriptions.get(descriptionKey({ id: 'r', uid: 'other' }, 'me'))
      ?.interpretation,
  ).toBe('Other author');
  expect(
    await repository().readDescriptions([{ id: 'r', projectId: 'wrong' }]),
  ).toEqual(new Map());
  expect(mocks.remote).not.toHaveBeenCalled();
});

it('hydrates 128 records with five bounded record queries and one unique parent query', async () => {
  const items = Array.from({ length: 128 }, (_, index) => ({
    id: 'r' + index,
    projectId: 'p',
  }));
  for (const item of items)
    mocks.documents.set('users/me/records/' + item.id, record);
  // Baseline the former hydration path against the same synthetic cache.
  const repo = repository();
  await Promise.all(
    items.map((item) => repo.readRecordDetail('me', item.id, item.projectId)),
  );
  expect(mocks.reads).toHaveBeenCalledTimes(256);
  mocks.reads.mockClear();
  const result = await repo.readDescriptions([...items, ...items]);
  expect(result.size).toBe(128);
  expect(mocks.reads).not.toHaveBeenCalled();
  expect(mocks.queries).toHaveBeenCalledTimes(6);
  const calls = mocks.queries.mock.calls.map(([target]) => target);
  expect(calls.map((target) => target.clauses[0].value.length)).toEqual([
    30, 30, 30, 30, 8, 1,
  ]);
  expect(
    calls.slice(0, 5).every((target) => target.path === 'users/me/records'),
  ).toBe(true);
  expect(calls[5]).toEqual({
    path: 'projects',
    clauses: [{ field: '__name__', op: 'in', value: ['p'] }],
  });
  expect(mocks.remote).not.toHaveBeenCalled();
});

it('batches unique parents at 30 and bounds cache query concurrency', async () => {
  const items = Array.from({ length: 300 }, (_, index) => ({
    id: 'r' + index,
    projectId: 'p' + index,
  }));
  for (const item of items) {
    mocks.documents.set('users/me/records/' + item.id, {
      ...record,
      projectId: item.projectId,
    });
    mocks.documents.set('projects/' + item.projectId, work);
  }
  const queryCache = mocks.queries.getMockImplementation()!;
  let active = 0;
  let peak = 0;
  mocks.queries.mockImplementation(async (target) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    const result = await queryCache(target);
    active--;
    return result;
  });
  expect(
    (
      await repository(items.map((item) => item.projectId)).readDescriptions(
        items,
      )
    ).size,
  ).toBe(300);
  expect(mocks.queries).toHaveBeenCalledTimes(20);
  expect(peak).toBe(8);
  expect(
    mocks.queries.mock.calls.every(
      ([target]) => target.clauses[0].value.length === 30,
    ),
  ).toBe(true);
});

it('revalidates hydrated schemas, ACLs and deletions on every call without trusting retained selections', async () => {
  const repo = repository();
  const items = [{ id: 'r', projectId: 'p' }];
  expect((await repo.readDescriptions(items)).size).toBe(1);
  for (const parent of [
    undefined,
    { ...work, type: 'personal', createdBy: 'other' },
    { ...work, confidential: undefined },
  ]) {
    if (parent) mocks.documents.set('projects/p', parent);
    else mocks.documents.delete('projects/p');
    expect(await repo.readDescriptions(items)).toEqual(new Map());
  }
  mocks.documents.set('projects/p', work);
  for (const data of [
    undefined,
    { ...record, uid: 'other' },
    { ...record, projectId: 'q' },
    { ...record, deletedAt: 'now' },
    { ...record, deletedAt: undefined },
    { ...record, endedAt: undefined },
  ]) {
    if (data) mocks.documents.set('users/me/records/r', data);
    else mocks.documents.delete('users/me/records/r');
    expect(await repo.readDescriptions(items)).toEqual(new Map());
  }
  mocks.documents.set('users/me/records/r', {
    ...record,
    interpretation: 'Updated',
  });
  expect(
    (await repo.readDescriptions(items)).get(descriptionKey(items[0], 'me'))
      ?.interpretation,
  ).toBe('Updated');
  expect(await repository([]).readDescriptions(items)).toEqual(new Map());
  expect(mocks.remote).not.toHaveBeenCalled();
});

it('isolates description owners, viewers and database instances while preserving confidential project identity', async () => {
  mocks.documents.set('projects/p', { ...work, confidential: true });
  mocks.documents.set('users/other/records/r', {
    ...record,
    uid: 'other',
    interpretation: 'Other',
  });
  const items = [
    { id: 'r', projectId: 'p' },
    { id: 'r', uid: 'other', projectId: 'p' },
  ];
  const result = await repository().readDescriptions(items);
  expect(result.get(descriptionKey(items[0], 'me'))).toMatchObject({
    uid: 'me',
    projectId: 'p',
  });
  expect(result.get(descriptionKey(items[1], 'me'))?.interpretation).toBe(
    'Other',
  );
  expect(mocks.queries.mock.calls.map(([target]) => target.path)).toEqual([
    'users/me/records',
    'users/other/records',
    'projects',
  ]);
  mocks.documents.set('projects/p', { ...work, type: 'personal' });
  expect((await repository().readDescriptions(items)).size).toBe(1);
  const otherAccount = new BrowserDetailRepository(
    {} as Firestore,
    'other',
    new Set(['p']),
  );
  expect(
    await otherAccount.readDescriptions([{ id: 'r', projectId: 'p' }]),
  ).toEqual(new Map());
  expect(mocks.remote).not.toHaveBeenCalled();
});

it('observes only authorized own lifecycle changes and rejects malformed paths before native queries', async () => {
  const observe = vi.fn();
  const repo = new BrowserDetailRepository(db, 'me', new Set(['p']), observe);
  const item = { id: 'r', projectId: 'p' };
  await repo.readDescriptions([item]);
  mocks.documents.set('users/me/records/r', { ...record, deletedAt: 'now' });
  expect(await repo.readDescriptions([item])).toEqual(new Map());
  expect(observe.mock.calls).toEqual([
    [[{ id: 'r', data: record }]],
    [[{ id: 'r', data: { ...record, deletedAt: 'now' } }]],
  ]);
  mocks.queries.mockClear();
  expect(
    await repo.readDescriptions([
      { ...item, id: '../r' },
      { ...item, uid: 'bad/owner' },
    ]),
  ).toEqual(new Map());
  expect(
    await new BrowserDetailRepository(db, '', new Set(['p'])).readDescriptions([
      item,
    ]),
  ).toEqual(new Map());
  expect(mocks.queries).not.toHaveBeenCalled();
});

it('propagates batch cache failures rather than returning silent partial hydration or reading remotely', async () => {
  mocks.queries.mockRejectedValueOnce(new Error('cache failed'));
  await expect(
    repository().readDescriptions([{ id: 'r', projectId: 'p' }]),
  ).rejects.toThrow('cache failed');
  expect(mocks.remote).not.toHaveBeenCalled();
});

it('queries exact audit collection with native document ordering and limit, retaining deleted events', async () => {
  mocks.documents.set('users/me/records/r/audit/z', { event: 'last' });
  mocks.documents.set('users/me/records/r/audit/a', {
    event: 'deleted',
    deletedAt: 'history',
  });
  mocks.documents.set('users/me/records/another/audit/a', {
    event: 'unrelated',
  });
  const rows = await repository().readAudit('r', 1);
  expect(rows).toEqual([
    { id: 'a', data: { event: 'deleted', deletedAt: 'history' } },
  ]);
  expect(mocks.queries).toHaveBeenCalledWith({
    path: 'users/me/records/r/audit',
    clauses: [{ order: '__name__' }, { limit: 1 }],
  });
  mocks.documents.set('users/me/records/r', { ...record, deletedAt: 'now' });
  expect(await repository().readAudit('r', 10)).toEqual([]);
});
it('keeps lazy audit demand in the native session and never scans workspace audit snapshots', async () => {
  const next = vi.fn();
  const stop = observeRecordAudit(db, 'me', 'r', 20, next);
  expect(mocks.audits[0].path).toBe('users/me/records/r');
  mocks.audits[0].next(
    snapshot({
      auditReady: [],
      audits: [
        { path: 'users/me/records/r/audit/retained', data: { private: true } },
      ],
    }),
  );
  await vi.waitFor(() =>
    expect(next).toHaveBeenLastCalledWith({
      rows: [],
      loading: true,
      error: '',
    }),
  );
  expect(mocks.queries).not.toHaveBeenCalled();
  mocks.documents.set('users/me/records/r/audit/current', { event: 'current' });
  mocks.audits[0].next(snapshot({ auditReady: ['users/me/records/r'] }));
  await vi.waitFor(() =>
    expect(next).toHaveBeenLastCalledWith({
      rows: [{ id: 'current', data: { event: 'current' } }],
      loading: false,
      error: '',
    }),
  );
  stop();
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.remote).not.toHaveBeenCalled();
});
it('fails closed on incomplete/revoked workspace and suppresses pending detail after disposal', async () => {
  const next = vi.fn();
  const stop = observeRecordDetail(db, 'me', 'r', next);
  mocks.observers[0](snapshot({ complete: false }));
  expect(next).toHaveBeenLastCalledWith({
    record: null,
    loading: true,
    error: '',
  });
  expect(mocks.reads).not.toHaveBeenCalled();
  mocks.observers[0](snapshot());
  await vi.waitFor(() =>
    expect(next).toHaveBeenLastCalledWith({
      record,
      loading: false,
      error: '',
    }),
  );
  mocks.observers[0](snapshot({ projects: [] }));
  expect(next).toHaveBeenLastCalledWith({
    record: null,
    loading: true,
    error: '',
  });
  await vi.waitFor(() =>
    expect(next).toHaveBeenLastCalledWith({
      record: null,
      loading: false,
      error: '',
    }),
  );
  let resolve: (value: unknown) => void = () => {};
  mocks.reads.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mocks.observers[0](snapshot());
  stop();
  const calls = next.mock.calls.length;
  resolve({ exists: () => true, data: () => record });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(next).toHaveBeenCalledTimes(calls);
});
it('selects report options natively by authorized document IDs and searches safe projections only', async () => {
  mocks.documents.set('projects/secret', {
    createdBy: 'me',
    archived: false,
    type: 'work',
    confidential: true,
    title: 'Secret title',
    description: 'Hidden words',
    topics: [],
  });
  mocks.documents.set('projects/p', {
    ...work,
    topics: [
      { archived: false, id: 'active', title: 'Active' },
      { id: 'old', archived: true },
    ],
  });
  const repo = repository(['p', 'secret']);
  const masked = await repo.readReportCatalog({
    revealed: false,
    projectId: 'p',
    includeArchived: false,
  });
  expect(masked.projectOptions).toContainEqual({
    id: 'secret',
    label: 'Projeto reservado',
    searchText: 'Projeto reservado Conteúdo oculto.',
  });
  expect(masked.topics).toEqual([{ id: 'active', label: 'Active' }]);
  expect(mocks.queries.mock.calls[0][0].clauses).toEqual([
    { field: '__name__', op: 'in', value: ['p', 'secret'] },
  ]);
  const global = await repo.readReportCatalog({
    revealed: false,
    global: true,
    projectId: 'secret',
    includeArchived: true,
  });
  expect(global.projectOptions.map((option) => option.id)).toEqual(['p']);
  expect(global.selectionAvailable).toBe(false);
  const detail = await repo.readProjectTopic('p', 'alias');
  expect(detail.canonical).toBeNull();
  expect(detail.topic).toBeUndefined();
  const active = await repo.readProjectTopic('p', 'active');
  expect(active.canonical).toBe('active');
  expect(active.topic?.title).toBe('Active');
  const removed = await repo.readProjectTopic('p', 'removed');
  expect(removed.canonical).toBeNull();
  expect(removed.topic).toBeUndefined();
  mocks.documents.set('projects/p', {
    ...work,
    topics: [
      { id: 'alias', archived: true, mergedIntoTopicId: 'active' },
      { id: 'active', archived: false },
    ],
  });
  const rejected = await repo.readProjectTopic('p', 'alias');
  expect(rejected.project).toBeUndefined();
  expect(rejected.canonical).toBeNull();
  expect(rejected.topic).toBeUndefined();
});
it('fails closed for absent lifecycle or project state on direct reads', async () => {
  for (const patch of [{ endedAt: undefined }, { deletedAt: undefined }]) {
    mocks.documents.set('users/me/records/r', { ...record, ...patch });
    expect(await repository().readRecordDetail('me', 'r')).toBeNull();
  }
  mocks.documents.set('users/me/records/r', record);
  for (const patch of [{ archived: undefined }, { confidential: undefined }]) {
    mocks.documents.set('projects/p', { ...work, ...patch });
    expect(await repository().readRecordDetail('me', 'r')).toBeNull();
  }
});
it('uncached ID reads never trigger a remote fallback', async () => {
  mocks.reads.mockRejectedValue({ code: 'unavailable' });
  expect(await repository().readRecordDetail('me', 'missing')).toBeNull();
  expect(mocks.remote).not.toHaveBeenCalled();
});
it('preserves active-to-tombstone lifecycle invalidation without exposing tombstone content', async () => {
  const next = vi.fn();
  const initial = deletionRevision('me');
  const stop = observeRecordDetail(db, 'me', 'r', next);
  mocks.observers[0](snapshot());
  await vi.waitFor(() =>
    expect(next).toHaveBeenLastCalledWith({
      record,
      loading: false,
      error: '',
    }),
  );
  mocks.documents.set('users/me/records/r', { ...record, deletedAt: 'now' });
  mocks.observers[0](snapshot());
  await vi.waitFor(() =>
    expect(next).toHaveBeenLastCalledWith({
      record: null,
      loading: false,
      error: '',
    }),
  );
  expect(deletionRevision('me')).toBe(initial + 1);
  mocks.observers[0](snapshot());
  await vi.waitFor(() =>
    expect(next).toHaveBeenLastCalledWith({
      record: null,
      loading: false,
      error: '',
    }),
  );
  expect(deletionRevision('me')).toBe(initial + 1);
  stop();
});
it('exposes topic catalog only at exactly one selected project and validates all selected ACLs', async () => {
  mocks.documents.set('projects/p', {
    ...work,
    topics: [{ id: 't', title: 'Topic', archived: false }],
  });
  mocks.documents.set('projects/q', { ...work, title: 'Second' });
  const repo = repository(['p', 'q']);
  const options = { revealed: true, includeArchived: false };
  const single = await repo.readReportCatalog({
    ...options,
    projectIds: ['p', 'p'],
  });
  expect(single.topics).toEqual([{ id: 't', label: 'Topic' }]);
  for (const projectIds of [[], ['p', 'q']]) {
    const result = await repo.readReportCatalog({ ...options, projectIds });
    expect(result.selectedProject).toBeUndefined();
    expect(result.topics).toEqual([]);
    expect(result.validTopicIds.size).toBe(0);
    expect(result.selectionAvailable).toBe(true);
  }
  expect(
    (await repo.readReportCatalog({ ...options, projectIds: ['p', 'missing'] }))
      .selectionAvailable,
  ).toBe(false);
  await expect(
    repo.readReportCatalog({ ...options, projectId: 'p', projectIds: ['q'] }),
  ).rejects.toThrow();
  expect(mocks.remote).not.toHaveBeenCalled();
});
