import { expect, it, vi } from 'vitest';
import { Firestore, Query } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { FirestoreCompanyReportRepository } from './firestore-company-report.js';
it('pushes project and requested people into native queries and shards complete selections beyond30 people', async () => {
  const query = {
    where: vi.fn().mockImplementation(() => query),
    orderBy: vi.fn().mockImplementation(() => query),
    limit: vi.fn().mockImplementation(() => query),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  };
  const collectionGroup = vi.fn(() => query);
  const repo = new FirestoreCompanyReportRepository(
    { collectionGroup } as unknown as Firestore,
    {} as Auth,
  );
  await repo.readPage(100, undefined, 'p', { userIds: ['alice', 'bob'] });
  expect(query.where.mock.calls).toEqual([
    ['deletedAt', '==', null],
    ['projectId', '==', 'p'],
    ['uid', 'in', ['alice', 'bob']],
  ]);
  expect(query.limit).toHaveBeenCalledWith(101);
  query.where.mockClear();
  query.get.mockClear();
  const uids = Array.from({ length: 31 }, (_, i) => 'u' + i);
  await repo.readPage(100, undefined, 'p', { userIds: uids });
  expect(query.where.mock.calls).toEqual([
    ['deletedAt', '==', null],
    ['projectId', '==', 'p'],
    ['uid', 'in', uids.slice(0, 30)],
    ['uid', '==', 'u30'],
  ]);
  expect(query.get).toHaveBeenCalledTimes(2);
});
it('merges person shards in canonical document order before limiting and resumes every shard after one cursor', async () => {
  const source = {
    projectId: 'p',
    deletedAt: null,
    endedAt: null,
    startedAt: '2026-10-08T10:00:00Z',
    timeZone: 'UTC',
    topics: [],
  };
  const doc = (uid: string, id: string) => ({
    id,
    ref: { path: 'users/' + uid + '/records/' + id },
    data: () => ({ ...source, uid }),
  });
  const a = doc('u00', 'one'),
    b = doc('u30', 'one');
  const get = vi
    .fn()
    .mockResolvedValueOnce({ docs: [b] })
    .mockResolvedValueOnce({ docs: [a] });
  const query = {
    where: vi.fn().mockImplementation(() => query),
    startAfter: vi.fn().mockImplementation(() => query),
    orderBy: vi.fn().mockImplementation(() => query),
    limit: vi.fn().mockImplementation(() => query),
    get,
  };
  const repo = new FirestoreCompanyReportRepository(
    {
      collectionGroup: () => query,
      doc: (path: string) => ({ path }),
      collection: () => ({ doc: (id: string) => ({ id }) }),
      getAll: () =>
        Promise.resolve([
          {
            id: 'p',
            exists: true,
            data: () => ({
              createdBy: 'alice',
              topics: [],
              type: 'work',
              archived: false,
              confidential: false,
            }),
          },
        ]),
    } as unknown as Firestore,
    {} as Auth,
  );
  const selection = {
    userIds: Array.from(
      { length: 31 },
      (_, i) => 'u' + String(i).padStart(2, '0'),
    ),
  };
  const page = await repo.readPage(1, undefined, 'p', selection);
  expect(page.records.map((r) => r.uid)).toEqual(['u00']);
  expect(page.nextCursor).toBe(a.ref.path);
  get.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [b] });
  const next = await repo.readPage(1, page.nextCursor!, 'p', selection);
  expect(query.startAfter).toHaveBeenCalledWith({ path: a.ref.path });
  expect(next.records.map((r) => r.uid)).toEqual(['u30']);
  expect(next.nextCursor).toBeNull();
});
it.each([null, '2026-10-08T11:00:00Z'])(
  'bounds canonical collection-group pages and rejects payload ownership mismatch',
  async (endedAt) => {
    const value = {
      topics: [],
      uid: 'alice',
      projectId: 'p',
      deletedAt: null,

      startedAt: '2026-10-08T10:00:00Z',
      endedAt,
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
      collectionGroup = vi
        .fn()
        .mockReturnValue({ where: () => ({ orderBy }), orderBy });
    const repo = new FirestoreCompanyReportRepository(
      {
        collectionGroup,
        collection: () => ({ doc: (id: string) => ({ id }) }),
        getAll: () =>
          Promise.resolve([
            {
              id: 'p',
              exists: true,
              data: () => ({
                createdBy: 'alice',
                topics: [],
                type: 'work',
                archived: false,
                confidential: false,
              }),
            },
          ]),
        doc: () => ({ path: 'users/alice/records/zero' }),
      } as unknown as Firestore,
      {} as Auth,
    );
    const page = await repo.readPage(1, 'users/alice/records/zero');
    expect(limit).toHaveBeenCalledExactlyOnceWith(2);
    expect(collectionGroup).toHaveBeenCalledExactlyOnceWith('records');
    expect(page.nextCursor).toBe('users/alice/records/one');
    expect(page.records[0]?.endedAt).toBe(endedAt ?? undefined);
    expect(page.records[0]).not.toHaveProperty('originalText');
    get.mockResolvedValue({
      docs: [
        {
          id: 'one',
          ref: { path: 'users/bob/records/one' },
          data: () => value,
        },
      ],
    });
    await expect(repo.readPage(1)).rejects.toThrow('canonical');
  },
);

it('merges dated UID shards by date then document key before bounding each physical page', async () => {
  const make = (uid: string, id: string, startedAt: string) => ({
    id,
    ref: { path: 'users/' + uid + '/records/' + id },
    data: () => ({
      uid,
      projectId: 'p',
      deletedAt: null,
      endedAt: null,
      startedAt,
      timeZone: 'UTC',
      topics: [],
    }),
  });
  const a = make('u00', 'one', '2026-10-08T12:00:00Z');
  const b = make('u30', 'old-open', '2026-09-01T10:00:00Z');
  const c = make('u30', 'same-date', '2026-10-08T12:00:00Z');
  const get = vi
    .fn()
    .mockResolvedValueOnce({ docs: [a] })
    .mockResolvedValueOnce({ docs: [b, c] });
  const query = {
    where: vi.fn().mockImplementation(() => query),
    orderBy: vi.fn().mockImplementation(() => query),
    startAfter: vi.fn().mockImplementation(() => query),
    limit: vi.fn().mockImplementation(() => query),
    get,
  };
  const repo = new FirestoreCompanyReportRepository(
    {
      collectionGroup: () => query,
      doc: (path: string) => ({ path }),
      collection: () => ({ doc: (id: string) => ({ id }) }),
      getAll: () =>
        Promise.resolve([
          {
            id: 'p',
            exists: true,
            data: () => ({
              createdBy: 'alice',
              topics: [],
              type: 'work',
              archived: false,
              confidential: false,
            }),
          },
        ]),
    } as unknown as Firestore,
    {} as Auth,
  );
  const selection = {
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
    userIds: Array.from(
      { length: 31 },
      (_, i) => 'u' + String(i).padStart(2, '0'),
    ),
  };
  const first = await repo.readPage(1, undefined, 'p', selection);
  expect(first.records.map((r) => r.id)).toEqual(['old-open']);
  expect(query.where.mock.calls).toEqual([
    ['deletedAt', '==', null],
    ['projectId', '==', 'p'],
    ['uid', 'in', selection.userIds.slice(0, 30)],
    ['startedAt', '<', '2026-10-11'],
    ['uid', '==', 'u30'],
    ['startedAt', '<', '2026-10-11'],
  ]);
  expect(query.limit.mock.calls).toEqual([[2], [2]]);
  get.mockResolvedValueOnce({ docs: [a] }).mockResolvedValueOnce({ docs: [c] });
  const second = await repo.readPage(1, first.nextCursor!, 'p', selection);
  expect(second.records.map((r) => r.id)).toEqual(['one']);
  expect(query.startAfter.mock.calls).toEqual([
    ['2026-09-01T10:00:00Z', { path: b.ref.path }],
    ['2026-09-01T10:00:00Z', { path: b.ref.path }],
  ]);
  get.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [c] });
  const third = await repo.readPage(1, second.nextCursor!, 'p', selection);
  expect(third.records.map((r) => r.id)).toEqual(['same-date']);
  expect(query.startAfter).toHaveBeenCalledWith('2026-10-08T12:00:00Z', {
    path: a.ref.path,
  });
  expect(third.nextCursor).toBeNull();
});

it.each([undefined, '2026-10-09T00:00:00Z'])(
  'builds resumed company UID predicates before cursors using the actual Admin SDK (to=%s)',
  async (to) => {
    const db = new Firestore({ projectId: 'demo-report-native-query' });
    const make = (id: string) => ({
      id,
      ref: db.doc('users/alice/records/' + id),
      data: () => ({
        uid: 'alice',
        projectId: 'p',
        deletedAt: null,
        endedAt: null,
        startedAt: '2026-10-08T12:00:00Z',
        timeZone: 'UTC',
        topics: [],
      }),
    });
    const docs = [make('a'), make('b')];
    const queries: unknown[] = [];
    const get = vi.spyOn(Query.prototype, 'get').mockImplementation(function (
      this: Query,
    ) {
      queries.push((this as Query & { toProto(): unknown }).toProto());
      return Promise.resolve({
        docs,
      } as unknown as FirebaseFirestore.QuerySnapshot);
    });
    const catalog = vi.spyOn(db, 'getAll').mockResolvedValue([
      {
        id: 'p',
        exists: true,
        data: () => ({
          createdBy: 'alice',
          topics: [],
          type: 'work',
          archived: false,
          confidential: false,
        }),
      },
    ] as unknown as FirebaseFirestore.DocumentSnapshot[]);
    try {
      const repo = new FirestoreCompanyReportRepository(db, {} as Auth);
      const selection = { to, userIds: ['alice', 'bob'] };
      const first = await repo.readPage(1, undefined, 'p', selection);
      await repo.readPage(1, first.nextCursor!, 'p', selection);
      expect(queries).toHaveLength(2);
      const serialized = JSON.stringify(queries[1]);
      expect(serialized).toContain('IN');
      expect(serialized).toContain('uid');
      expect(serialized).toContain('startAt');
      expect(serialized).toContain('users/alice/records/a');
    } finally {
      get.mockRestore();
      catalog.mockRestore();
    }
  },
);
