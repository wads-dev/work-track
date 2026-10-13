import { it, expect, vi } from 'vitest';
import {
  createOwnRecordsRepository,
  emptyRecords,
} from './own-records-repository';
import type { Row } from '../../shared/data';
it('deduplicates consumers, hydrates >100 and reflects replacement/removal/errors/retry', () => {
  const repo = createOwnRecordsRepository();
  repo.account('a');
  const db = {};
  let next!: (rows: Row[], cache: boolean) => void;
  let fail!: () => void;
  const stop = vi.fn();
  const connect = vi.fn((cb: typeof next, error: () => void) => {
    next = cb;
    fail = error;
    return stop;
  });
  const unsub = repo.subscribe(db, 'a', connect, () => {});
  repo.subscribe(db, 'a', connect, () => {});
  unsub();
  expect(connect).toHaveBeenCalledOnce();
  expect(stop).not.toHaveBeenCalled();
  const rows = Array.from({ length: 150 }, (_, i) => ({
    id: String(i),
    data: {},
  }));
  next(rows, true);
  expect(repo.snapshot(db, 'a').complete).toBe(false);
  next(rows, false);
  expect(repo.snapshot(db, 'a').rows).toHaveLength(150);
  expect(repo.snapshot(db, 'a').complete).toBe(true);
  next([{ id: '1', data: { updated: true } }], false);
  expect(repo.snapshot(db, 'a').rows).toHaveLength(1);
  fail();
  expect(repo.snapshot(db, 'a').rows).toEqual([]);
  expect(repo.snapshot(db, 'a').error).not.toBe('');
  const oldNext = next;
  repo.retry(db, 'a');
  oldNext(rows, false);
  expect(repo.snapshot(db, 'a')).toBe(emptyRecords);
  next(rows, false);
  expect(repo.snapshot(db, 'a').rows).toHaveLength(150);
  repo.subscribe(db, 'a', connect, () => {});
  expect(connect).toHaveBeenCalledTimes(2);
});
it('purges account, refuses stale subscribe, guards callbacks and isolates instances', () => {
  const repo = createOwnRecordsRepository();
  repo.account('a');
  const db = {};
  let next!: (rows: Row[], cache: boolean) => void;
  const stop = vi.fn();
  repo.subscribe(
    db,
    'a',
    (cb) => {
      next = cb;
      return stop;
    },
    () => {},
  );
  repo.account('b');
  expect(stop).toHaveBeenCalledOnce();
  const stale = vi.fn(() => () => {});
  repo.subscribe(db, 'a', stale, () => {});
  expect(stale).not.toHaveBeenCalled();
  next([{ id: 'foreign', data: {} }], false);
  expect(repo.snapshot(db, 'a')).toBe(emptyRecords);
  const other = {};
  repo.subscribe(
    other,
    'b',
    (cb) => {
      cb([{ id: 'b', data: {} }], false);
      return () => {};
    },
    () => {},
  );
  expect(repo.snapshot(db, 'b').rows).toEqual([]);
  expect(repo.snapshot(other, 'b').rows).toHaveLength(1);
  repo.account('');
  expect(repo.snapshot(other, 'b')).toBe(emptyRecords);
});
it('reconnects one central entry and updates both active subscribers', () => {
  const repo = createOwnRecordsRepository();
  repo.account('a');
  const db = {};
  const a = vi.fn(),
    b = vi.fn();
  let next!: (rows: Row[], cache: boolean) => void;
  let fail!: () => void;
  const connect = vi.fn((cb: typeof next, error: () => void) => {
    next = cb;
    fail = error;
    return () => {};
  });
  repo.subscribe(db, 'a', connect, a);
  repo.subscribe(db, 'a', connect, b);
  fail();
  repo.retry(db, 'a');
  a.mockClear();
  b.mockClear();
  next([{ id: 'new', data: {} }], false);
  expect(connect).toHaveBeenCalledTimes(2);
  expect(a).toHaveBeenCalledOnce();
  expect(b).toHaveBeenCalledOnce();
});
it('isolates filter/page result entries and keeps complete counts supplied by the native repository', () => {
  const repo = createOwnRecordsRepository();
  repo.account('a');
  const db = {};
  repo.subscribe(
    db,
    'a',
    (next) => {
      next([{ id: 'page', data: {} }], false, {
        rows: [],
        total: 151,
        page: 2,
        hasMore: true,
        cursor: 'page',
        openRows: [],
        openCount: 0,
      });
      return () => {};
    },
    () => {},
    'page:2',
  );
  repo.subscribe(
    db,
    'a',
    (next) => {
      next([{ id: 'open', data: {} }], false);
      return () => {};
    },
    () => {},
    'open',
  );
  expect(repo.snapshot(db, 'a', 'page:2')).toMatchObject({
    total: 151,
    page: 2,
    hasMore: true,
  });
  expect(repo.snapshot(db, 'a', 'open').rows[0].id).toBe('open');
  expect(repo.snapshot(db, 'a')).toBe(emptyRecords);
  repo.account('b');
  expect(repo.snapshot(db, 'a', 'page:2')).toBe(emptyRecords);
});
