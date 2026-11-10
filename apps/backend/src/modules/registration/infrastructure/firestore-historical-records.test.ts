import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreHistoricalRecordsRepository } from './firestore-historical-records.js';
import { listRecordsInput } from '../presentation/historical-record-tools.js';
function fixture() {
  const data = [
    {
      uid: 'u',
      projectId: 'p',
      startedAt: '2026-05-01T00:00:00Z',
      endedAt: '2026-08-01T00:00:00Z',
      topics: [{ topicId: 'general' }],
      originalText: 'evidence',
    },
    {
      uid: 'u',
      projectId: 'p',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: null,
      topics: [{ topicId: 'general' }],
    },
    {
      uid: 'u',
      projectId: 'secret',
      startedAt: '2026-07-01T00:00:00Z',
      endedAt: null,
      topics: [{ topicId: 'general' }],
    },
  ];
  const docs = data.map((d, i) => ({
    id: String(i),
    data: () => d,
    updateTime: {
      toDate: () => new Date(0),
      toMillis: () => 0,
      nanoseconds: 0,
    },
  }));
  const q = {
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    get: vi.fn(() => Promise.resolve({ docs, size: docs.length })),
  };
  q.where.mockReturnValue(q);
  q.orderBy.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  const db = {
    collection: (name: string) =>
      name === 'users'
        ? { doc: () => ({ collection: () => q }) }
        : {
            doc: (id: string) => ({
              get: () =>
                Promise.resolve({
                  data: () =>
                    id === 'secret'
                      ? { type: 'personal', createdBy: 'other' }
                      : { type: 'work' },
                }),
            }),
          },
  } as unknown as Firestore;
  return { repo: new FirestoreHistoricalRecordsRepository(db), data, q };
}
it('counts crossing spans and old opens, hides unauthorized projects and paginates', async () => {
  const { repo } = fixture();
  const input = listRecordsInput.parse({
    from: '2026-06-01T00:00:00Z',
    topicId: 'general',
    limit: 1,
  });
  const first = await repo.listRecords(input, 'u');
  expect(first.totalCount).toBe(2);
  expect(first.hasMore).toBe(true);
  expect(first.records[0]!.originalText).toBe('evidence');
  const second = await repo.listRecords(
    { ...input, cursor: first.nextCursor! },
    'u',
  );
  expect(second.records[0]!.id).toBe('1');
  expect(second.hasMore).toBe(false);
});
it('rejects stale cursors and budget overflow rather than partial totals', async () => {
  const { repo, data, q } = fixture();
  const input = listRecordsInput.parse({ limit: 1 });
  const first = await repo.listRecords(input, 'u');
  data[0]!.originalText = 'changed';
  await expect(
    repo.listRecords({ ...input, cursor: first.nextCursor! }, 'u'),
  ).rejects.toThrow('histórico alterado');
  q.get.mockResolvedValueOnce({ docs: [], size: 10001 });
  await expect(repo.listRecords(input, 'u')).rejects.toThrow(
    'Nenhum total parcial',
  );
});
it('validates ranges and rejects unexpected fields', () => {
  expect(
    listRecordsInput.safeParse({
      from: '2026-07-01T00:00:00Z',
      to: '2026-06-01T00:00:00Z',
    }).success,
  ).toBe(false);
  expect(listRecordsInput.safeParse({ project: 'x' }).success).toBe(false);
});
