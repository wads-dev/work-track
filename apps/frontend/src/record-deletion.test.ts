import { it, expect } from 'vitest';
import { deletionAccount } from './record-deletion';
import { projectRepository } from './project-repository';
import { readFileSync } from 'node:fs';
import {
  isDeletedRecord,
  createDeletionObserver,
  deletionRevision,
} from './record-deletion';
import { createOwnRecordsRepository } from './own-records-repository';
import { isOpen, isAlertOpen } from './pending-utils';
import { filterRecords, recordPage } from './record-filters';
import type { Row } from './data';
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
  expect(source('./RecordDrawer.tsx')).toContain(
    'data && !isDeletedRecord(data) ? data : null',
  );
  expect(source('./data.ts')).toContain("path.endsWith('/records')");
  for (const name of ['./PersonalPage.tsx', './ProjectReport.tsx']) {
    expect(source(name)).toContain('deletionRevision(uid) !== revision');
    expect(source(name)).toContain('reportOwner === uid');
  }
  expect(source('./PendingPage.tsx')).toContain('activeRows.length < 100');
  expect(source('./PendingPage.tsx')).toContain('!isDeletedRecord(doc.data())');
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
