import { it, expect, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import type { WorkspaceSnapshot } from '../../data/sync/workspace-sync';
const workspace = vi.hoisted(() => ({
  listeners: [] as {
    uid: string;
    next: (snapshot: WorkspaceSnapshot) => void;
    active: boolean;
    stop: ReturnType<typeof vi.fn>;
  }[],
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  callable: vi.fn(),
}));
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
  onSnapshot: workspace.onSnapshot,
  getDocs: workspace.getDocs,
  getDoc: workspace.getDoc,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: workspace.callable }));
const materialization = (rows: Row[], complete = true): WorkspaceSnapshot => ({
  projects: [
    { id: 'p', data: {} },
    { id: 'q', data: {} },
  ],
  records: rows.map((row) => ({
    path: 'users/' + String(row.data.uid ?? 'alice') + '/records/' + row.id,
    data: { uid: 'alice', ...row.data },
  })),
  completedProjects: ['p', 'q'],
  complete,
  syncing: false,
  error: '',
});
const emit = (snapshot: WorkspaceSnapshot) => {
  const listener = workspace.listeners.at(-1)!;
  if (listener.active) listener.next(snapshot);
};
const expectNoRemoteReads = () => {
  expect(workspace.onSnapshot).not.toHaveBeenCalled();
  expect(workspace.getDocs).not.toHaveBeenCalled();
  expect(workspace.getDoc).not.toHaveBeenCalled();
  expect(workspace.callable).not.toHaveBeenCalled();
};
import {
  subscribeAuthorizedOwnRecords,
  type OwnRecordPage,
} from '../../data/sources/authorized-own-record-source';
import { deletionAccount } from '../../data/cache/record-deletion';
import { projectRepository } from '../../data/cache/project-repository';
import { readFileSync } from 'node:fs';
import {
  isDeletedRecord,
  createDeletionObserver,
  deletionRevision,
} from '../../data/cache/record-deletion';
import { createOwnRecordsRepository } from '../../data/cache/own-records-repository';
import { isOpen, isAlertOpen } from '../../features/pending/pending-utils';
import {
  filterRecords,
  recordPage,
} from '../../features/records/record-filters';
import type { Row } from '../../shared/data';
it('legacy undefined/null active, all nonnull malformed tombstones excluded', () => {
  for (const value of ['2026-10-09T00:00:00Z', '', false, 0, {}, []])
    expect(isDeletedRecord({ deletedAt: value })).toBe(true);
  expect(isDeletedRecord({})).toBe(false);
  expect(isDeletedRecord({ deletedAt: null })).toBe(false);
  expect(isOpen({ deletedAt: '', endedAt: null })).toBe(false);
  expect(
    isAlertOpen({ deletedAt: false, startedAt: '2020-01-01T00:00:00Z' }),
  ).toBe(false);
});
it('hydrates only active rows preserving raw audit content and active page capacity', () => {
  const repo = createOwnRecordsRepository();
  repo.account('x');
  const db = {};
  let next!: (rows: Row[], cache: boolean) => void;
  repo.subscribe(
    db,
    'x',
    (cb) => {
      next = cb;
      return () => {};
    },
    () => {},
  );
  const rows = Array.from({ length: 151 }, (_, i) => ({
    id: String(i),
    data:
      i < 101
        ? { deletedAt: 'deleted', originalText: 'Audit preserved' }
        : { endedAt: null },
  }));
  next(rows, false);
  expect(repo.snapshot(db, 'x').rows).toHaveLength(50);
  expect(rows[0].data.originalText).toBe('Audit preserved');
  const filtered = filterRecords(rows, {
    project: '',
    topic: '',
    query: '',
    fromDate: '',
    toDate: '',
    zone: 'America/Sao_Paulo',
    status: 'all',
  });
  expect(recordPage(filtered, 0)).toHaveLength(50);
  expect(repo.snapshot(db, 'x').complete).toBe(true);
});
it('observed active-to-deleted transition increments only its UID once, initial tombstones do not emit', () => {
  const observe = createDeletionObserver('observer-test');
  const initial = deletionRevision('observer-test');
  observe([
    { id: 'already', data: { deletedAt: 'old' } },
    { id: 'active', data: {} },
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
  expect(audit).toContain('observeWorkspaceAudit(db, uid');
  expect(audit).toContain('snapshot.complete && visible');
  expect(audit).toContain('!isDeletedRecord(parent.data)');
  expect(audit).toContain('(snapshot.audits ?? [])');
  expect(audit).toContain('row.path.startsWith(prefix)');
  expect(audit).toContain("row.path.split('/').length === 6");
  expect(audit).toContain('.slice(0, maxRows)');
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
  expect(pending).toContain('{ openOnly: true }');
  expect(pending).not.toContain('size: 100');
  expect(pending).toContain(
    'page.rows.filter((r) => !isDeletedRecord(r.data))',
  );
  expect(pending).not.toContain('setNextCursor');
  expect(pending).not.toContain('Examinar próxima página');
});
it('caps local raw pages and advances past tombstones without skipping live rows or repeating cursors', () => {
  workspace.listeners.splice(0);
  const facts = Array.from({ length: 103 }, (_, i) => ({
    id: String(i).padStart(3, '0'),
    data: {
      projectId: i % 2 ? 'q' : 'p',
      ...(i < 100 ? { deletedAt: 'gone' } : { endedAt: null }),
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
it('pending selects strict null locally without limits and stays live beyond 100 opens', () => {
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
    data: { projectId: 'p', endedAt: null },
  }));
  const excluded: Row[] = [
    { id: 'missing', data: { projectId: 'p' } },
    { id: 'closed', data: { projectId: 'p', endedAt: '2026-10-08' } },
    { id: 'other-owner', data: { uid: 'bob', projectId: 'p', endedAt: null } },
    ...['', false, 0, {}, []].map((endedAt, i) => ({
      id: 'malformed-' + i,
      data: { projectId: 'p', endedAt },
    })),
  ];
  emit(materialization([...rows, ...excluded]));
  expect(next.mock.lastCall![0].rows).toHaveLength(151);
  expect(
    next.mock.lastCall![0].rows.every(
      (row: Row) => row.data.endedAt === null && row.data.uid === 'alice',
    ),
  ).toBe(true);
  expect(next.mock.lastCall![0].hasMore).toBe(false);
  emit(materialization([...rows.slice(1), ...excluded]));
  expect(next.mock.lastCall![0].rows).toHaveLength(150);
  // Revocation/removal replaces local state rather than retaining an old open row.
  emit(materialization([]));
  expect(next.mock.lastCall![0].rows).toEqual([]);
  stop();
  const calls = next.mock.calls.length;
  emit(materialization(rows));
  expect(next).toHaveBeenCalledTimes(calls);
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
  observer([{ id: 'a', data: {} }]);
  observer([{ id: 'a', data: { deletedAt: 'now' } }]);
  expect(first).toBe(1);
  expect(second).toBe(1);
  expect(deletionRevision('purge-a')).toBe(1);
  deletionAccount('purge-b');
  expect(deletionRevision('purge-a')).toBe(0);
  observer([{ id: 'later', data: {} }]);
  observer([{ id: 'later', data: { deletedAt: 'now' } }]);
  expect(first).toBe(1);
  expect(second).toBe(1);
  expect(deletionRevision('purge-b')).toBe(0);
  stop1();
  stop2();
  deletionAccount('');
});
