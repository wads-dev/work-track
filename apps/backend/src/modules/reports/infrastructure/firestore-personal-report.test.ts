import { expect, it, vi } from 'vitest';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { FirestorePersonalReportRepository } from './firestore-personal-report.js';
it('pushes project selection into the owner query while preserving nullable/missing tombstones and spanning offset intervals', async () => {
  const values = [
    {
      id: 'span',
      startedAt: '2026-10-01T22:00:00-03:00',
      endedAt: '2026-10-10T01:00:00+02:00',
    },
    {
      id: 'open',
      startedAt: '2026-09-01T10:00:00Z',
      endedAt: null,
      deletedAt: null,
    },
    {
      id: 'old',
      startedAt: '2026-10-01T10:00:00Z',
      endedAt: '2026-10-01T11:00:00Z',
    },
    { id: 'removed', startedAt: 'bad', deletedAt: false },
    {
      id: 'east-offset',
      startedAt: '2026-10-09T23:58:00+23:59',
      endedAt: null,
    },
    {
      id: 'west-offset',
      startedAt: '2026-10-07T00:01:00-23:59',
      endedAt: '2026-10-08T01:00:00Z',
    },
  ];
  const where = vi.fn().mockImplementation(() => query);
  const query = {
    where,
    orderBy: vi.fn().mockImplementation(() => query),
    limit: vi.fn().mockImplementation(() => query),
    get: () =>
      Promise.resolve({
        docs: values.map((value) => ({
          id: value.id,
          data: () => ({
            projectId: 'p',
            timeZone: 'UTC',
            topics: [],
            ...value,
          }),
        })),
      }),
  };
  const repo = new FirestorePersonalReportRepository({
    collection: (name: string) =>
      name === 'users'
        ? { doc: () => ({ collection: () => query }) }
        : { doc: (id: string) => ({ id }) },
    getAll: () =>
      Promise.resolve([
        { id: 'p', exists: true, data: () => ({ type: 'work' }) },
      ]),
  } as unknown as Firestore);
  const page = await repo.readPage('alice', 100, undefined, {
    projectId: 'p',
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
  });
  expect(where.mock.calls).toEqual([
    ['projectId', '==', 'p'],
    ['startedAt', '<', '2026-10-11'],
  ]);
  expect(query.orderBy.mock.calls).toEqual([
    ['startedAt'],
    [FieldPath.documentId()],
  ]);
  expect(page.records.map((r) => r.id)).toEqual([
    'span',
    'open',
    'east-offset',
    'west-offset',
  ]);
});
it.each([undefined, null, '2026-10-08T11:00:00Z'])(
  'scans only the auth UID path, bounds pages and omits transcripts',
  async (endedAt) => {
    const data = {
      projectId: 'project',
      startedAt: '2026-10-08T10:00:00Z',
      endedAt,
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
    expect(page.records[0]?.endedAt).toBe(endedAt ?? undefined);
    expect(page.records[0]).not.toHaveProperty('originalText');
    expect(page.records[0]).not.toHaveProperty('interpretation');
  },
);

it('resumes a dated page after both native order fields, including empty residual pages', async () => {
  const value = (id: string) => ({
    id,
    data: () => ({
      projectId: 'p',
      startedAt: '2026-09-01T10:00:00Z',
      endedAt: '2026-09-01T11:00:00Z',
      timeZone: 'UTC',
      topics: [],
    }),
  });
  const get = vi
    .fn()
    .mockResolvedValueOnce({ docs: [value('a'), value('b')] })
    .mockResolvedValueOnce({ docs: [value('b')] });
  const query = {
    where: vi.fn().mockImplementation(() => query),
    orderBy: vi.fn().mockImplementation(() => query),
    startAfter: vi.fn().mockImplementation(() => query),
    limit: vi.fn().mockImplementation(() => query),
    get,
  };
  const repo = new FirestorePersonalReportRepository({
    collection: (name: string) =>
      name === 'users'
        ? { doc: () => ({ collection: () => query }) }
        : { doc: (id: string) => ({ id }) },
    getAll: () =>
      Promise.resolve([
        { id: 'p', exists: true, data: () => ({ type: 'work' }) },
      ]),
  } as unknown as Firestore);
  const selection = {
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
  };
  const first = await repo.readPage('alice', 1, undefined, selection);
  expect(first.records).toEqual([]);
  expect(first.nextCursor).toMatch(/^report-date-v1:/);
  const second = await repo.readPage('alice', 1, first.nextCursor!, selection);
  expect(query.startAfter).toHaveBeenCalledExactlyOnceWith(
    '2026-09-01T10:00:00Z',
    'a',
  );
  expect(query.limit.mock.calls).toEqual([[2], [2]]);
  expect(second.records).toEqual([]);
  expect(second.nextCursor).toBeNull();
});
