import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestorePersonalReportRepository } from './firestore-personal-report.js';
it('scans only the auth UID path, bounds pages and omits transcripts', async () => {
  const data = {
    projectId: 'project',
    startedAt: '2026-10-08T10:00:00Z',
    timeZone: 'UTC',
    originalText: 'secret',
    interpretation: 'private',
    uid: 'bob',
  };
  const get = vi.fn().mockResolvedValue({
    docs: [
      { id: 'a', data: () => data },
      { id: 'b', data: () => data },
    ],
  });
  const limit = vi.fn().mockReturnValue({ get }),
    startAfter = vi.fn().mockReturnValue({ limit }),
    orderBy = vi.fn().mockReturnValue({ limit, startAfter });
  const records = vi.fn().mockReturnValue({ orderBy }),
    doc = vi.fn().mockReturnValue({ collection: records }),
    collection = vi.fn().mockReturnValue({ doc });
  const repo = new FirestorePersonalReportRepository({
    collection,
    getAll: () =>
      Promise.resolve([
        { id: 'project', exists: true, data: () => ({ type: 'work' }) },
      ]),
  } as unknown as Firestore);
  const page = await repo.readPage('alice', 1, 'previous');
  expect(collection).toHaveBeenCalledWith('users');
  expect(collection).toHaveBeenCalledWith('projects');
  expect(doc).toHaveBeenCalledWith('alice');
  expect(records).toHaveBeenCalledExactlyOnceWith('records');
  expect(limit).toHaveBeenCalledExactlyOnceWith(2);
  expect(startAfter).toHaveBeenCalledExactlyOnceWith('previous');
  expect(page).toMatchObject({ scannedCount: 1, nextCursor: 'a' });
  expect(page.records[0]?.uid).toBe('alice');
  expect(page.records[0]).not.toHaveProperty('originalText');
  expect(page.records[0]).not.toHaveProperty('interpretation');
});
