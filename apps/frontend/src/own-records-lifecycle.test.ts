import { expect, it, vi } from 'vitest';
import {
  createOwnRecordsRepository,
  emptyRecords,
} from './own-records-repository';
it('drops history listener on final unsubscribe and reloads on next consumer', () => {
  const repo = createOwnRecordsRepository();
  repo.account('a');
  const db = {};
  const stop = vi.fn(),
    connect = vi.fn(() => stop);
  const off = repo.subscribe(db, 'a', connect, () => {});
  off();
  expect(stop).toHaveBeenCalledOnce();
  expect(repo.snapshot(db, 'a')).toBe(emptyRecords);
  repo.subscribe(db, 'a', connect, () => {});
  expect(connect).toHaveBeenCalledTimes(2);
});
