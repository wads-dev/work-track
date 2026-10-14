import { beforeEach, it, expect, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import type { WorkspaceSnapshot } from '../../data/sync/workspace-sync';
import type { Row } from '../../shared/data';
import { readFileSync } from 'node:fs';

type Constraint = {
  kind?: 'orderBy' | 'limit';
  field?: string;
  op?: string;
  value?: unknown;
  count?: number;
  direction?: 'asc' | 'desc';
};
type CacheQuery = { path: string; clauses: Constraint[] };
const workspace = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const compare = (a: unknown, b: unknown): number => {
    if (JSON.stringify(a) === JSON.stringify(b)) return 0;
    const rank = (value: unknown) =>
      value === null
        ? 0
        : typeof value === 'boolean'
          ? 1
          : typeof value === 'number'
            ? 2
            : typeof value === 'string'
              ? 3
              : 4;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a! < b! ? -1 : 1;
  };
  const getDocsFromCache = vi.fn(async (target: CacheQuery) => {
    const value = (
      [path, data]: [string, Record<string, unknown>],
      field?: string,
    ) => (field === '__name__' ? path.split('/').at(-1) : data[field ?? '']);
    let selected = [...docs].filter(
      ([path]) => path.slice(0, path.lastIndexOf('/')) === target.path,
    );
    for (const clause of target.clauses) {
      if (clause.kind === 'limit') continue;
      selected = selected.filter((entry) => {
        const actual = value(entry, clause.field);
        if (actual === undefined) return false;
        if (clause.kind === 'orderBy') return true;
        const comparison = compare(actual, clause.value);
        switch (clause.op) {
          case '==':
            return comparison === 0;
          case '!=':
            return comparison !== 0;
          case 'in':
            return (clause.value as unknown[]).some(
              (candidate) => compare(actual, candidate) === 0,
            );
          case '>':
            return comparison > 0;
          case '>=':
            return comparison >= 0;
          case '<':
            return comparison < 0;
          case '<=':
            return comparison <= 0;
          default:
            throw Error('Unsupported native cache predicate: ' + clause.op);
        }
      });
    }
    const ordering = target.clauses.filter(
      (clause) => clause.kind === 'orderBy',
    );
    selected.sort((a, b) => {
      for (const clause of ordering) {
        const difference = compare(
          value(a, clause.field),
          value(b, clause.field),
        );
        if (difference)
          return clause.direction === 'desc' ? -difference : difference;
      }
      return compare(a[0], b[0]);
    });
    const maximum = target.clauses.find(
      (clause) => clause.kind === 'limit',
    )?.count;
    if (maximum !== undefined) selected = selected.slice(0, maximum);
    return {
      docs: selected.map(([path, data]) => ({
        id: path.split('/').at(-1)!,
        data: () => structuredClone(data),
      })),
    };
  });
  const getDocFromCache = vi.fn(async ({ path }: { path: string }) => ({
    exists: () => docs.has(path),
    data: () => structuredClone(docs.get(path)),
  }));
  const remote = () =>
    vi.fn(() => {
      throw Error('Unexpected remote read');
    });
  return {
    docs,
    getDocsFromCache,
    getDocFromCache,
    listeners: [] as {
      uid: string;
      next: (snapshot: WorkspaceSnapshot) => void;
      active: boolean;
      stop: ReturnType<typeof vi.fn>;
    }[],
    onSnapshot: remote(),
    getDocs: remote(),
    getDocsFromServer: remote(),
    getDoc: remote(),
    callable: remote(),
  };
});
vi.mock('../../data/sync/workspace-runtime', () => ({
  observeWorkspace: (
    _db: Firestore,
    uid: string,
    next: (snapshot: WorkspaceSnapshot) => void,
  ) => {
    const listener = {
      uid,
      next,
      active: true,
      stop: vi.fn(() => {
        listener.active = false;
      }),
    };
    workspace.listeners.push(listener);
    return listener.stop;
  },
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  documentId: () => '__name__',
  query: (base: { path: string }, ...clauses: Constraint[]) => ({
    ...base,
    clauses,
  }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string, direction = 'asc') => ({
    kind: 'orderBy',
    field,
    direction,
  }),
  limit: (count: number) => ({ kind: 'limit', count }),
  getDocFromCache: workspace.getDocFromCache,
  getDocsFromCache: workspace.getDocsFromCache,
  onSnapshot: workspace.onSnapshot,
  getDocs: workspace.getDocs,
  getDocsFromServer: workspace.getDocsFromServer,
  getDoc: workspace.getDoc,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: workspace.callable }));
const materialization = (rows: Row[], complete = true): WorkspaceSnapshot => ({
  projects: [
    {
      id: 'p',
      data: {
        createdBy: 'alice',
        type: 'work',
        archived: false,
        confidential: false,
        topics: [],
      },
    },
    {
      id: 'q',
      data: {
        createdBy: 'alice',
        type: 'work',
        archived: false,
        confidential: false,
        topics: [],
      },
    },
  ],
  records: rows.map((row) => ({
    path: 'users/alice/records/' + row.id,
    data: { uid: 'alice', ...row.data },
  })),
  completedProjects: ['p', 'q'],
  complete,
  syncing: false,
  error: '',
});
const emit = (snapshot: WorkspaceSnapshot) => {
  workspace.docs.clear();
  for (const project of snapshot.projects)
    workspace.docs.set('projects/' + project.id, project.data);
  for (const record of snapshot.records)
    workspace.docs.set(record.path, record.data);
  const listener = workspace.listeners.at(-1)!;
  if (listener.active)
    listener.next({
      ...snapshot,
      completedProjects: snapshot.projects.map((p) => p.id),
    });
};
const expectNoRemoteReads = () => {
  for (const read of [
    workspace.onSnapshot,
    workspace.getDocs,
    workspace.getDocsFromServer,
    workspace.getDoc,
    workspace.callable,
  ])
    expect(read).not.toHaveBeenCalled();
};
beforeEach(() => {
  vi.clearAllMocks();
  workspace.listeners.length = 0;
  workspace.docs.clear();
});
import {
  subscribeAuthorizedOwnRecords,
  type OwnRecordPage,
} from '../../data/sources/authorized-own-record-source';
import { readOwnRecordListing } from '../../data/repositories/browser-listing-repository';
import {
  deletionAccount,
  isDeletedRecord,
  createDeletionObserver,
  deletionRevision,
} from '../../data/cache/record-deletion';
import { projectRepository } from '../../data/cache/project-repository';
import { createOwnRecordsRepository } from '../../data/cache/own-records-repository';
import { isOpen, isAlertOpen } from '../../features/pending/pending-utils';

it('native fixture executes document ID, owner, project and date predicates before ordering and limit', async () => {
  for (const [id, data] of [
    [
      'before',
      { uid: 'alice', projectId: 'p', startedAt: '2026-10-07T00:00:00Z' },
    ],
    ['a', { uid: 'alice', projectId: 'p', startedAt: '2026-10-08T00:00:00Z' }],
    ['b', { uid: 'alice', projectId: 'p', startedAt: '2026-10-09T00:00:00Z' }],
    [
      'other-owner',
      { uid: 'bob', projectId: 'p', startedAt: '2026-10-09T00:00:00Z' },
    ],
    [
      'other-project',
      { uid: 'alice', projectId: 'q', startedAt: '2026-10-09T00:00:00Z' },
    ],
    ['missing-date', { uid: 'alice', projectId: 'p' }],
  ] as const)
    workspace.docs.set('users/alice/records/' + id, data);
  const result = await workspace.getDocsFromCache({
    path: 'users/alice/records',
    clauses: [
      {
        field: '__name__',
        op: 'in',
        value: [
          'a',
          'b',
          'before',
          'other-owner',
          'other-project',
          'missing-date',
        ],
      },
      { field: 'uid', op: '==', value: 'alice' },
      { field: 'projectId', op: '==', value: 'p' },
      { field: 'startedAt', op: '>=', value: '2026-10-08' },
      { kind: 'orderBy', field: 'startedAt', direction: 'desc' },
      { kind: 'limit', count: 1 },
    ],
  });
  expect(result.docs.map((doc) => doc.id)).toEqual(['b']);
  expect(
    (
      await workspace.getDocFromCache({ path: 'users/alice/records/a' })
    ).exists(),
  ).toBe(true);
  expect(
    (
      await workspace.getDocFromCache({ path: 'users/alice/records/absent' })
    ).exists(),
  ).toBe(false);
  expectNoRemoteReads();
});
it('only explicit null is active, missing and malformed tombstones excluded', () => {
  for (const value of ['2026-10-09T00:00:00Z', '', false, 0, {}, []])
    expect(isDeletedRecord({ deletedAt: value })).toBe(true);
  expect(isDeletedRecord({})).toBe(true);
  expect(isDeletedRecord({ deletedAt: undefined })).toBe(true);
  expect(isDeletedRecord({ deletedAt: null })).toBe(false);
  expect(isOpen({ deletedAt: '', endedAt: null })).toBe(false);
  expect(
    isAlertOpen({ deletedAt: false, startedAt: '2020-01-01T00:00:00Z' }),
  ).toBe(false);
});
it('native active pagination excludes tombstones before filling pages and preserves raw audit content', async () => {
  const rows: Row[] = Array.from({ length: 151 }, (_, i) => ({
    id: String(i).padStart(3, '0'),
    data: {
      projectId: 'p',
      endedAt: null,
      topics: [],
      ...(i < 101
        ? { deletedAt: 'deleted', originalText: 'Audit preserved' }
        : { deletedAt: null }),
    },
  }));
  const snapshot = materialization(rows);
  for (const project of snapshot.projects)
    workspace.docs.set('projects/' + project.id, project.data);
  for (const record of snapshot.records)
    workspace.docs.set(record.path, record.data);
  const result = await readOwnRecordListing(
    {} as Firestore,
    'alice',
    new Set(['p', 'q']),
    { includeDeleted: false, page: 0, size: 50 },
  );
  expect(result.rows).toHaveLength(50);
  expect(result).toMatchObject({
    total: 50,
    hasMore: false,
    page: 0,
    openCount: 50,
  });
  expect(rows[0].data.originalText).toBe('Audit preserved');
  expect(workspace.docs.get('users/alice/records/000')?.originalText).toBe(
    'Audit preserved',
  );
  const repo = createOwnRecordsRepository();
  repo.account('x');
  const db = {};
  let next!: (rows: Row[], cache: boolean) => void;
  const stop = repo.subscribe(
    db,
    'x',
    (callback) => {
      next = callback;
      return () => {};
    },
    () => {},
  );
  next(rows, false);
  expect(repo.snapshot(db, 'x').rows).toHaveLength(50);
  expect(repo.snapshot(db, 'x').complete).toBe(true);
  stop();
  expectNoRemoteReads();
});
it('observed active-to-deleted transition increments only its UID once, initial tombstones do not emit', () => {
  const observe = createDeletionObserver('observer-test');
  const initial = deletionRevision('observer-test');
  observe([
    { id: 'already', data: { deletedAt: 'old' } },
    { id: 'active', data: { endedAt: null, deletedAt: null, topics: [] } },
  ]);
  expect(deletionRevision('observer-test')).toBe(initial);
  observe([
    { id: 'already', data: { deletedAt: 'old' } },
    { id: 'active', data: { deletedAt: 'new' } },
  ]);
  expect(deletionRevision('observer-test')).toBe(initial + 1);
  observe([{ id: 'active', data: { deletedAt: 'new' } }]);
  expect(deletionRevision('observer-test')).toBe(initial + 1);
  expect(deletionRevision('unrelated')).toBe(0);
});
it('record editor hides deleted parent, audit is not filtered; reports guard revision stale responses', () => {
  const source = (name: string) =>
    readFileSync(new URL(name, import.meta.url), 'utf8');
  expect(source('../../features/records/RecordDrawer.tsx')).toContain(
    'data && !isDeletedRecord(data) ? data : null',
  );
  const audit = source('../../shared/data.ts');
  expect(audit).toContain(
    'observeRecordAudit(db, uid, parts[3], maxRows, setState)',
  );
  expect(audit).not.toContain('snapshot.records');
  expect(audit).not.toContain('snapshot.audits');
  const repository = source(
    '../../data/repositories/browser-detail-repository.ts',
  );
  expect(repository).toContain('observeWorkspaceAudit(db, uid, parentPath');
  expect(repository).toContain('readRecordDetail(uid, recordId)');
  expect(repository).toContain('isDeletedRecord(data) ? null : data');
  expect(repository).toContain('orderBy(documentId())');
  expect(repository).toContain('limit(count)');
  expect(audit).not.toContain('isDeletedRecord(row.data)');
  for (const remote of ['onSnapshot', 'getDoc(', 'getDocs', 'httpsCallable']) {
    expect(audit).not.toContain(remote);
    expect(source('../../features/records/RecordDrawer.tsx')).not.toContain(
      remote,
    );
  }
  for (const name of [
    '../../features/reports/PersonalPage.tsx',
    '../../features/reports/ProjectReport.tsx',
  ]) {
    expect(source(name)).toContain('deletionRevision(uid) !== revision');
    expect(source(name)).toContain('reportOwner === uid');
  }
  const pending = source('../../features/pending/PendingPage.tsx');
  expect(pending).toContain('openOnly: true');
  expect(pending).not.toContain('size: 100');
  expect(pending).not.toContain('.filter(');
  expect(pending).not.toContain('.slice(');
  expect(pending).not.toContain('setNextCursor');
  expect(pending).not.toContain('Examinar próxima página');
});
it('caps native raw pages and advances past tombstones without skipping live rows or repeating cursors', async () => {
  workspace.listeners.splice(0);
  const facts = Array.from({ length: 103 }, (_, i) => ({
    id: String(i).padStart(3, '0'),
    data: {
      endedAt: null,
      topics: [],
      projectId: i % 2 ? 'q' : 'p',
      ...(i < 100 ? { deletedAt: 'gone' } : { deletedAt: null }),
    },
  }));
  let cursor = '';
  const seen = new Set<string>();
  const active: string[] = [];
  for (let pageNumber = 0; pageNumber < 2; pageNumber++) {
    let page: OwnRecordPage | undefined;
    const stop = subscribeAuthorizedOwnRecords(
      {} as Firestore,
      'alice',
      (value) => {
        page = value;
      },
      () => {
        throw Error('unexpected failure');
      },
      { size: 100, after: cursor },
    );
    expect(workspace.listeners.at(-1)!.uid).toBe('alice');
    // Incomplete disk/bootstrap state never publishes stale facts as a complete page.
    emit(materialization(facts, false));
    expect(page).toMatchObject({
      rows: [],
      fromCache: true,
      hasMore: false,
      cursor,
    });
    emit(materialization([...facts].reverse()));
    await vi.waitFor(() => expect(page?.fromCache).toBe(false));
    const result = page!;
    expect(result.rows.length).toBeLessThanOrEqual(100);
    for (const row of result.rows) {
      expect(seen.has(row.id)).toBe(false);
      seen.add(row.id);
      if (!isDeletedRecord(row.data)) active.push(row.id);
    }
    expect(result.cursor > cursor).toBe(true);
    expect(result.fromCache).toBe(false);
    if (pageNumber === 0) {
      expect(result.rows).toHaveLength(100);
      expect(active).toEqual([]);
      expect(result.cursor).toBe('099');
      expect(result.hasMore).toBe(true);
      expect(result.rows[0].data.deletedAt).toBe('gone');
    } else {
      expect(result.rows).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    }
    cursor = result.cursor;
    stop();
    expect(workspace.listeners.at(-1)!.stop).toHaveBeenCalledOnce();
  }
  expect(active).toEqual(['100', '101', '102']);
  expect(seen.size).toBe(103);
  expect(workspace.listeners).toHaveLength(2);
  expectNoRemoteReads();
});
it('pending selects only explicit null endings without truncation beyond 100 opens', async () => {
  workspace.listeners.splice(0);
  const next = vi.fn();
  const stop = subscribeAuthorizedOwnRecords(
    {} as Firestore,
    'alice',
    next,
    vi.fn(),
    { openOnly: true },
  );
  const rows = Array.from({ length: 151 }, (_, i) => ({
    id: String(i),
    data: { projectId: 'p', endedAt: null, deletedAt: null, topics: [] },
  }));
  const excluded: Row[] = [
    {
      id: 'closed',
      data: {
        projectId: 'p',
        endedAt: '2026-10-08T00:00:00Z',
        deletedAt: null,
        topics: [],
      },
    },
    {
      id: 'other-owner',
      data: {
        uid: 'bob',
        projectId: 'p',
        endedAt: null,
        deletedAt: null,
        topics: [],
      },
    },
    ...['', false, 0, {}, []].map((endedAt, i) => ({
      id: 'malformed-' + i,
      data: { projectId: 'p', endedAt, deletedAt: null, topics: [] },
    })),
  ];
  const missing: Row[] = [
    {
      id: 'missing-end',
      data: { projectId: 'p', deletedAt: null, topics: [] },
    },
    {
      id: 'missing-deletion',
      data: { projectId: 'p', endedAt: null, topics: [] },
    },
  ];
  const tombstones: Row[] = ['', false, 0, {}, []].map((deletedAt, i) => ({
    id: 'deleted-' + i,
    data: { projectId: 'p', endedAt: null, deletedAt },
  }));
  emit(materialization([...rows, ...missing, ...excluded, ...tombstones]));
  await vi.waitFor(() => expect(next.mock.lastCall![0].fromCache).toBe(false));
  expect(next.mock.lastCall![0].rows).toHaveLength(151);
  expect(
    next.mock.lastCall![0].rows.every(
      (row: Row) =>
        row.data.endedAt === null &&
        row.data.deletedAt === null &&
        row.data.uid === 'alice',
    ),
  ).toBe(true);
  expect(next.mock.lastCall![0].hasMore).toBe(false);
  emit(
    materialization([...rows.slice(1), ...missing, ...excluded, ...tombstones]),
  );
  await vi.waitFor(() => expect(next.mock.lastCall![0].fromCache).toBe(false));
  expect(next.mock.lastCall![0].rows).toHaveLength(150);
  // Revocation/removal replaces local state rather than retaining an old open row.
  emit(materialization([]));
  await vi.waitFor(() => expect(next.mock.lastCall![0].fromCache).toBe(false));
  expect(next.mock.lastCall![0].rows).toEqual([]);
  stop();
  const calls = next.mock.calls.length;
  emit(materialization(rows));
  expect(next).toHaveBeenCalledTimes(calls);
  expectNoRemoteReads();
});
it('never publishes an older cache query after a new readiness generation or stop', async () => {
  const next = vi.fn();
  const fail = vi.fn();
  const stop = subscribeAuthorizedOwnRecords(
    {} as Firestore,
    'alice',
    next,
    fail,
    { includeDeleted: false },
  );
  type CachedResult = Awaited<ReturnType<typeof workspace.getDocsFromCache>>;
  let resolve!: (value: CachedResult) => void;
  workspace.getDocsFromCache.mockImplementationOnce(
    () =>
      new Promise<CachedResult>((done) => {
        resolve = done;
      }),
  );
  emit(
    materialization([
      {
        id: 'old',
        data: { projectId: 'p', endedAt: null, deletedAt: null, topics: [] },
      },
    ]),
  );
  emit(
    materialization([
      {
        id: 'current',
        data: { projectId: 'p', endedAt: null, deletedAt: null, topics: [] },
      },
    ]),
  );
  await vi.waitFor(() =>
    expect(next.mock.lastCall![0]).toMatchObject({
      fromCache: false,
      rows: [{ id: 'current' }],
    }),
  );
  const calls = next.mock.calls.length;
  resolve({
    docs: [
      {
        id: 'old',
        data: () => ({
          uid: 'alice',
          projectId: 'p',
          endedAt: null,
          deletedAt: null,
          topics: [],
        }),
      },
    ],
  });
  // Await an independent native query behind the old continuation rather than
  // concluding absence before asynchronous work has run.
  await readOwnRecordListing({} as Firestore, 'alice', new Set(['p', 'q']));
  expect(next).toHaveBeenCalledTimes(calls);
  expect(next.mock.lastCall![0].rows.map((row: Row) => row.id)).toEqual([
    'current',
  ]);
  workspace.getDocsFromCache.mockImplementationOnce(
    () =>
      new Promise<CachedResult>((done) => {
        resolve = done;
      }),
  );
  emit(
    materialization([
      {
        id: 'late',
        data: { projectId: 'p', endedAt: null, deletedAt: null, topics: [] },
      },
    ]),
  );
  stop();
  const stoppedCalls = next.mock.calls.length;
  resolve({
    docs: [
      {
        id: 'late',
        data: () => ({
          uid: 'alice',
          projectId: 'p',
          endedAt: null,
          deletedAt: null,
          topics: [],
        }),
      },
    ],
  });
  await readOwnRecordListing({} as Firestore, 'alice', new Set(['p', 'q']));
  expect(next).toHaveBeenCalledTimes(stoppedCalls);
  expect(fail).not.toHaveBeenCalled();
  expectNoRemoteReads();
});
it('reports a native cache failure without publishing a false complete empty page or remote fallback', async () => {
  const next = vi.fn();
  const fail = vi.fn();
  const stop = subscribeAuthorizedOwnRecords(
    {} as Firestore,
    'alice',
    next,
    fail,
  );
  workspace.getDocsFromCache.mockRejectedValueOnce(
    new Error('Native cache failed'),
  );
  emit(materialization([{ id: 'cached', data: { projectId: 'p' } }]));
  await vi.waitFor(() => expect(fail).toHaveBeenCalledOnce());
  expect(fail).toHaveBeenCalledWith('Native cache failed');
  expect(next.mock.calls.every(([page]) => page.fromCache)).toBe(true);
  stop();
  expectNoRemoteReads();
});
it('non-null malformed endings are not open', () => {
  for (const endedAt of ['', false, 0, {}, []])
    expect(isOpen({ endedAt })).toBe(false);
});
it('observed deletion invalidates two project subscribers and purge fences old observer', () => {
  let first = 0;
  let second = 0;
  const stop1 = projectRepository.subscribe(() => first++);
  const stop2 = projectRepository.subscribe(() => second++);
  deletionAccount('purge-a');
  const observer = createDeletionObserver('purge-a');
  observer([{ id: 'a', data: { endedAt: null, deletedAt: null, topics: [] } }]);
  observer([{ id: 'a', data: { deletedAt: 'now' } }]);
  expect(first).toBe(1);
  expect(second).toBe(1);
  expect(deletionRevision('purge-a')).toBe(1);
  deletionAccount('purge-b');
  expect(deletionRevision('purge-a')).toBe(0);
  observer([
    { id: 'later', data: { endedAt: null, deletedAt: null, topics: [] } },
  ]);
  observer([{ id: 'later', data: { deletedAt: 'now' } }]);
  expect(first).toBe(1);
  expect(second).toBe(1);
  expect(deletionRevision('purge-b')).toBe(0);
  stop1();
  stop2();
  deletionAccount('');
});
