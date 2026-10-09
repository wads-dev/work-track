import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { FirestoreCompanyReportRepository } from './firestore-company-report.js';
it('bounds canonical collection-group pages and rejects payload ownership mismatch', async () => {
  const value = {
    uid: 'alice',
    projectId: 'p',
    startedAt: '2026-10-08T10:00:00Z',
    timeZone: 'UTC',
    originalText: 'private',
  };
  const get = vi.fn().mockResolvedValue({
    docs: [
      {
        id: 'one',
        ref: { path: 'users/alice/records/one' },
        data: () => value,
      },
      {
        id: 'two',
        ref: { path: 'users/alice/records/two' },
        data: () => value,
      },
    ],
  });
  const limit = vi.fn().mockReturnValue({ get }),
    startAfter = vi.fn().mockReturnValue({ limit }),
    orderBy = vi.fn().mockReturnValue({ limit, startAfter }),
    collectionGroup = vi.fn().mockReturnValue({ orderBy });
  const repo = new FirestoreCompanyReportRepository(
    {
      collectionGroup,
      doc: () => ({ path: 'users/alice/records/zero' }),
    } as unknown as Firestore,
    {} as Auth,
  );
  const page = await repo.readPage(1, 'users/alice/records/zero');
  expect(limit).toHaveBeenCalledExactlyOnceWith(2);
  expect(collectionGroup).toHaveBeenCalledExactlyOnceWith('records');
  expect(page.nextCursor).toBe('users/alice/records/one');
  expect(page.records[0]).not.toHaveProperty('originalText');
  get.mockResolvedValue({
    docs: [
      { id: 'one', ref: { path: 'users/bob/records/one' }, data: () => value },
    ],
  });
  await expect(repo.readPage(1)).rejects.toThrow('canonical');
});
