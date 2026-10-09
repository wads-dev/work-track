import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreReportRecordsRepository } from './firestore-report-records.js';

function setup(
  docs: { id: string; data: () => Record<string, unknown> }[] = [],
) {
  const get = vi.fn().mockResolvedValue({ docs });
  const limit = vi.fn().mockReturnValue({ get });
  const where = vi.fn().mockReturnValue({ limit, get });
  const collectionGroup = vi.fn().mockReturnValue({ where });
  // Mock only the SDK boundary; no Firebase initialization or live database access.
  const db = {
    collectionGroup,
    collection: () => ({
      doc: () => ({
        get: () =>
          Promise.resolve({ exists: true, data: () => ({ type: 'work' }) }),
      }),
    }),
  } as unknown as Firestore;
  return {
    repository: new FirestoreReportRecordsRepository(db),
    collectionGroup,
    where,
    limit,
    get,
  };
}

describe('FirestoreReportRecordsRepository', () => {
  it('limits active outputs only after >100 malformed tombstones', async () => {
    const { repository } = setup([
      ...Array.from({ length: 101 }, (_, i) => ({
        id: 'deleted' + i,
        data: () => ({ deletedAt: false, startedAt: null }),
      })),
      {
        id: 'active',
        data: () => ({ projectId: 'project', uid: 'alice', startedAt: 'now' }),
      },
    ]);
    expect(
      (await repository.listByProject('project', 1, 'alice')).map((r) => r.id),
    ).toEqual(['active']);
  });
  it('rejects absent viewer identity before a collection-group query', async () => {
    const { repository, collectionGroup } = setup();
    await expect(repository.listByProject('project', 1)).rejects.toThrow(
      'Projeto não encontrado.',
    );
    expect(collectionGroup).not.toHaveBeenCalled();
  });
  it('queries records across users by project with the requested bound and a minimal projection', async () => {
    const startedAt = '2026-10-08T21:00:00-03:00';
    const endedAt = '2026-10-08T22:00:00-03:00';
    const { repository, collectionGroup, where, limit, get } = setup([
      {
        id: 'alice-record',
        data: () => ({
          id: 'untrusted-field',
          projectId: 'project',
          uid: 'alice',
          startedAt,
          originalText: 'private transcript',
        }),
      },
      {
        id: 'bob-record',
        data: () => ({
          projectId: 'project',
          uid: 'bob',
          startedAt,
          endedAt,
          interpretation: 'private interpretation',
        }),
      },
    ]);
    const result = await repository.listByProject('project', 25, 'alice');
    expect(collectionGroup).toHaveBeenCalledExactlyOnceWith('records');
    expect(where).toHaveBeenCalledExactlyOnceWith('projectId', '==', 'project');
    expect(limit).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledExactlyOnceWith();
    expect(result).toEqual([
      { id: 'alice-record', projectId: 'project', uid: 'alice', startedAt },
      {
        id: 'bob-record',
        projectId: 'project',
        uid: 'bob',
        startedAt,
        endedAt,
      },
    ]);
    expect(result[0]).not.toHaveProperty('endedAt');
  });

  it.each([null, 123, false])(
    'omits non-string optional end timestamps (%s)',
    async (endedAt) => {
      const { repository } = setup([
        {
          id: 'open-record',
          data: () => ({
            projectId: 'project',
            uid: 'alice',
            startedAt: '2026-10-08T21:00:00Z',
            endedAt,
          }),
        },
      ]);
      const records = await repository.listByProject('project', 1, 'alice');
      expect(records[0]).not.toHaveProperty('endedAt');
    },
  );

  it('returns an empty collection when no records match', async () => {
    const { repository } = setup();
    await expect(
      repository.listByProject('empty-project', 100, 'alice'),
    ).resolves.toEqual([]);
  });

  it('propagates query errors for the application to handle', async () => {
    const { repository, get } = setup();
    const failure = new Error('Missing collection-group index');
    get.mockRejectedValue(failure);
    await expect(
      repository.listByProject('project', 100, 'alice'),
    ).rejects.toBe(failure);
  });
});
