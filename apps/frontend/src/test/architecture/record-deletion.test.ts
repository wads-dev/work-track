import { it, expect, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const recordListeners = vi.hoisted(
  () =>
    [] as {
      query: { base: string; constraints: unknown[] };
      options: { includeMetadataChanges: boolean };
      next: (snapshot: unknown) => void;
    }[],
);
const functions = vi.hoisted(() => ({}));
vi.mock('firebase/functions', () => ({
  getFunctions: () => functions,
  httpsCallable: () => vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  query: (base: string, ...constraints: unknown[]) => ({ base, constraints }),
  where: (...args: unknown[]) => ['where', ...args],
  orderBy: (value: unknown) => ['orderBy', value],
  documentId: () => '__name__',
  startAfter: (value: unknown) => ['after', value],
  limit: (value: number) => ['limit', value],
  onSnapshot: (
    query: { base: string; constraints: unknown[] },
    options: { includeMetadataChanges: boolean },
    next: (snapshot: unknown) => void,
  ) => {
    recordListeners.push({ query, options, next });
    return vi.fn();
  },
}));
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
  expect(source('../../shared/data.ts')).toContain("path.endsWith('/records')");
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
it('caps merged raw pages and advances past tombstones without skipping live rows or repeating cursors', async () => {
  // Typed projects are delivered by the live catalogs; no legacy parent reads.
  const loadCatalog = vi.spyOn(projectRepository, 'load').mockResolvedValue([]);
  const facts = Array.from({ length: 103 }, (_, i) => ({
    id: String(i).padStart(3, '0'),
    data: {
      projectId: i % 2 ? 'q' : 'p',
      ...(i < 100 ? { deletedAt: 'gone' } : { endedAt: null }),
    },
  }));
  const snapshot = (rows: Row[], pending = false) => ({
    docs: rows.map((row) => ({ id: row.id, data: () => row.data })),
    metadata: { fromCache: false, hasPendingWrites: pending },
  });
  let cursor = '';
  const seen = new Set<string>();
  const active: string[] = [];
  for (let pageNumber = 0; pageNumber < 2; pageNumber++) {
    recordListeners.splice(0);
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
    recordListeners[0].next(
      snapshot([
        { id: 'p', data: {} },
        { id: 'q', data: {} },
      ]),
    );
    recordListeners[1].next(snapshot([]));
    await Promise.resolve(); // Wait for authorized catalog discovery to hydrate.
    for (const listener of recordListeners.slice(2)) {
      const project = listener.query.constraints.find(
        (constraint) =>
          Array.isArray(constraint) && constraint[1] === 'projectId',
      ) as string[];
      expect(listener.options.includeMetadataChanges).toBe(true);
      expect(listener.query.constraints).toContainEqual(['limit', 100]);
      if (cursor)
        expect(listener.query.constraints).toContainEqual(['after', cursor]);
      listener.next(
        snapshot(
          facts
            .filter(
              (row) => row.data.projectId === project[3] && row.id > cursor,
            )
            .slice(0, 100),
          pageNumber === 0,
        ),
      );
    }
    expect(page).toBeDefined();
    const result = page!;
    expect(result.rows.length).toBeLessThanOrEqual(100);
    for (const row of result.rows) {
      expect(seen.has(row.id)).toBe(false);
      seen.add(row.id);
      if (!isDeletedRecord(row.data)) active.push(row.id);
    }
    expect(result.cursor > cursor).toBe(true);
    if (pageNumber === 0) {
      expect(result.rows).toHaveLength(100);
      expect(active).toEqual([]);
      expect(result.cursor).toBe('099');
      expect(result.hasMore).toBe(true);
      expect(result.fromCache).toBe(true);
    } else {
      expect(result.hasMore).toBe(false);
      expect(result.fromCache).toBe(false);
    }
    cursor = result.cursor;
    stop();
  }
  expect(active).toEqual(['100', '101', '102']);
  expect(seen.size).toBe(103);
  expect(loadCatalog).toHaveBeenCalledTimes(2);
  loadCatalog.mockRestore();
});
it('pending queries null in Firestore without limits and stays live beyond 100 opens', async () => {
  const catalog = vi.spyOn(projectRepository, 'load').mockResolvedValue([]);
  recordListeners.splice(0);
  const next = vi.fn();
  const stop = subscribeAuthorizedOwnRecords(
    {} as Firestore,
    'alice',
    next,
    vi.fn(),
    { openOnly: true },
  );
  const snapshot = (rows: Row[]) => ({
    docs: rows.map((row) => ({ id: row.id, data: () => row.data })),
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  recordListeners[0].next(snapshot([{ id: 'p', data: {} }]));
  recordListeners[1].next(snapshot([]));
  await Promise.resolve();
  const listener = recordListeners[2];
  expect(listener.query.base).toBe('users/alice/records');
  expect(listener.query.constraints).toContainEqual([
    'where',
    'projectId',
    '==',
    'p',
  ]);
  expect(listener.query.constraints).toContainEqual([
    'where',
    'endedAt',
    '==',
    null,
  ]);
  expect(
    listener.query.constraints.some(
      (c) => Array.isArray(c) && ['limit', 'after'].includes(c[0]),
    ),
  ).toBe(false);
  const rows = Array.from({ length: 151 }, (_, i) => ({
    id: String(i),
    data: { projectId: 'p', endedAt: null },
  }));
  listener.next(snapshot(rows));
  expect(next.mock.lastCall![0].rows).toHaveLength(151);
  expect(next.mock.lastCall![0].hasMore).toBe(false);
  listener.next(snapshot(rows.slice(1)));
  expect(next.mock.lastCall![0].rows).toHaveLength(150);
  stop();
  catalog.mockRestore();
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
