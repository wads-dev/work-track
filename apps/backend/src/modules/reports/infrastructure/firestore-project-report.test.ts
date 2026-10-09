import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { FirestoreProjectReportRepository } from './firestore-project-report.js';
it('bounds a collection-group page, uses document cursor, omits private content and uses display names only', async () => {
  const source = {
    uid: 'alice',
    projectId: 'project',
    startedAt: '2026-10-08T10:00:00Z',
    timeZone: 'UTC',
    topics: [],
    originalText: 'secret',
    interpretation: 'private',
  };
  const get = vi.fn().mockResolvedValue({
    docs: [
      {
        id: 'one',
        ref: { path: 'users/alice/records/one' },
        data: () => source,
      },
      {
        id: 'two',
        ref: { path: 'users/alice/records/two' },
        data: () => source,
      },
    ],
  });
  const limit = vi.fn().mockReturnValue({ get });
  const startAfter = vi.fn().mockReturnValue({ limit });
  const orderBy = vi.fn().mockReturnValue({ startAfter, limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const collectionGroup = vi.fn().mockReturnValue({ where });
  const db = {
    collectionGroup,
    doc: vi.fn().mockReturnValue({ path: 'users/alice/records/zero' }),
    collection: () => ({
      doc: () => ({
        get: () =>
          Promise.resolve({
            exists: true,
            data: () => ({ topics: [{ id: 'code', title: 'Código' }] }),
          }),
      }),
    }),
  } as unknown as Firestore;
  const auth = {
    getUsers: vi.fn().mockResolvedValue({
      users: [
        { uid: 'alice', displayName: 'Alice', email: 'private@wads.dev' },
      ],
    }),
  } as unknown as Auth;
  const repo = new FirestoreProjectReportRepository(db, auth);
  const page = await repo.readPage('project', 1, 'users/alice/records/zero');
  expect(collectionGroup).toHaveBeenCalledExactlyOnceWith('records');
  expect(where).toHaveBeenCalledExactlyOnceWith('projectId', '==', 'project');
  expect(startAfter).toHaveBeenCalledExactlyOnceWith({
    path: 'users/alice/records/zero',
  });
  expect(limit).toHaveBeenCalledExactlyOnceWith(2);
  expect(page?.nextCursor).toBe('users/alice/records/one');
  expect(page?.records).toHaveLength(1);
  expect(page?.records[0]).not.toHaveProperty('originalText');
  expect(page?.records[0]).not.toHaveProperty('interpretation');
  await expect(repo.userLabels(['alice'])).resolves.toEqual({ alice: 'Alice' });
});
