import { afterEach, expect, it, vi } from 'vitest';
import {
  Firestore,
  Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { FirestoreProjectReportRepository } from './firestore-project-report.js';
it.each([undefined, null, '2026-10-08T11:00:00Z'])(
  'bounds a collection-group page, uses document cursor, omits private content and uses display names only',
  async (endedAt) => {
    const source = {
      uid: 'alice',
      projectId: 'project',
      startedAt: '2026-10-08T10:00:00Z',
      endedAt,
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
    const page = await repo.readPage(
      'project',
      1,
      'users/alice/records/zero',
      'alice',
    );
    expect(collectionGroup).toHaveBeenCalledExactlyOnceWith('records');
    expect(where).toHaveBeenCalledExactlyOnceWith('projectId', '==', 'project');
    expect(startAfter).toHaveBeenCalledExactlyOnceWith({
      path: 'users/alice/records/zero',
    });
    expect(limit).toHaveBeenCalledExactlyOnceWith(2);
    expect(page?.nextCursor).toBe('users/alice/records/one');
    expect(page?.records).toHaveLength(1);
    expect(page?.records[0]?.endedAt).toBe(endedAt ?? undefined);
    expect(page?.records[0]).not.toHaveProperty('originalText');
    expect(page?.records[0]).not.toHaveProperty('interpretation');
    await expect(repo.userLabels(['alice'])).resolves.toEqual({
      alice: 'Alice',
    });
  },
);

afterEach(() => vi.restoreAllMocks());

// Build queries with the real Admin SDK and intercept only reads. Serialization
// rejects invalid inequality/order/cursor combinations that chain mocks accept.
function nativePageFixture(personal = false) {
  const db = new Firestore({ projectId: 'demo-project-report-query' });
  const queries: Record<string, unknown>[] = [];
  const pages: QueryDocumentSnapshot[][] = [];
  vi.spyOn(db, 'collection').mockImplementation((path) => {
    expect(path).toBe('projects');
    return {
      doc: () => ({
        get: () =>
          Promise.resolve({
            exists: true,
            data: () => ({
              type: personal ? 'personal' : 'work',
              createdBy: 'alice',
              topics: [
                { id: 'old', title: 'Old', mergedIntoTopicId: 'current' },
                { id: 'current', title: 'Current' },
              ],
            }),
          }),
      }),
    } as unknown as ReturnType<Firestore['collection']>;
  });
  const get = vi.spyOn(Query.prototype, 'get').mockImplementation(function (
    this: Query,
  ) {
    const proto = (
      this as Query & {
        toProto(): { structuredQuery: Record<string, unknown> };
      }
    ).toProto().structuredQuery;
    queries.push(proto);
    return Promise.resolve({
      docs: pages.shift() ?? [],
    } as unknown as QuerySnapshot);
  });
  const record = (
    id: string,
    data: Record<string, unknown> = {},
    path?: string,
  ) =>
    ({
      id,
      ref: db.doc(path ?? 'users/alice/records/' + id),
      data: () => ({
        uid: 'alice',
        projectId: 'project',
        startedAt: '2026-10-08T10:00:00Z',
        endedAt: '2026-10-08T11:00:00Z',
        timeZone: 'UTC',
        topics: [{ topicId: 'old' }],
        ...data,
      }),
    }) as unknown as QueryDocumentSnapshot;
  return {
    queries,
    pages,
    record,
    get,
    repo: new FirestoreProjectReportRepository(db, {} as Auth),
  };
}
const period = {
  from: '2026-10-08T00:00:00Z',
  to: '2026-10-09T00:00:00Z',
  includeArchived: true,
};
const queryFilters = (personal: boolean) => [
  {
    fieldFilter: {
      field: { fieldPath: 'projectId' },
      op: 'EQUAL',
      value: { stringValue: 'project' },
    },
  },
  ...(personal
    ? [
        {
          fieldFilter: {
            field: { fieldPath: 'uid' },
            op: 'EQUAL',
            value: { stringValue: 'alice' },
          },
        },
      ]
    : []),
  {
    fieldFilter: {
      field: { fieldPath: 'startedAt' },
      op: 'LESS_THAN',
      value: { stringValue: '2026-10-11' },
    },
  },
];

it.each([false, true])(
  'pushes normal project date/UID constraints before a complete SDK cursor (personal=%s)',
  async (personal) => {
    const { repo, pages, record, queries } = nativePageFixture(personal);
    pages.push([record('a'), record('b')], [record('b')]);
    const first = await repo.readPage('project', 1, undefined, 'alice', period);
    expect(first?.records.map((row) => row.id)).toEqual(['a']);
    expect(first?.nextCursor).toMatch(/^report-date-v1:/);
    const second = await repo.readPage(
      'project',
      1,
      first!.nextCursor!,
      'alice',
      period,
    );
    expect(second?.records.map((row) => row.id)).toEqual(['b']);
    expect(second?.nextCursor).toBeNull();
    for (const query of queries) {
      expect(query.where).toEqual({
        compositeFilter: { op: 'AND', filters: queryFilters(personal) },
      });
      expect(query.orderBy).toEqual([
        { field: { fieldPath: 'startedAt' }, direction: 'ASCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
      ]);
      expect(query.limit).toEqual({ value: 2 });
    }
    expect(queries[1]!.startAt).toEqual({
      values: [
        { stringValue: '2026-10-08T10:00:00Z' },
        {
          referenceValue:
            'projects/demo-project-report-query/databases/(default)/documents/users/alice/records/a',
        },
      ],
    });
  },
);

it('advances the dated cursor by the physical page even when all rows fail tombstone/overlap residuals', async () => {
  const { repo, pages, record, queries } = nativePageFixture();
  const startedAt = '2026-01-01T00:00:00Z';
  pages.push(
    [
      record('a', { startedAt, deletedAt: '2026-10-08T00:00:00Z' }),
      record('b', { startedAt, endedAt: '2026-01-02T00:00:00Z' }),
      record('c', { startedAt, endedAt: '2026-12-01T00:00:00Z' }),
    ],
    [record('c', { startedAt, endedAt: '2026-12-01T00:00:00Z' })],
  );
  const first = await repo.readPage('project', 2, undefined, 'alice', period);
  expect(first?.records).toEqual([]);
  expect(first?.nextCursor).toMatch(/^report-date-v1:/);
  const second = await repo.readPage(
    'project',
    2,
    first!.nextCursor!,
    'alice',
    period,
  );
  expect(second?.records.map((row) => row.id)).toEqual(['c']);
  expect(queries[1]!.startAt).toMatchObject({
    values: [
      { stringValue: startedAt },
      {
        referenceValue:
          'projects/demo-project-report-query/databases/(default)/documents/users/alice/records/b',
      },
    ],
  });
});

it('keeps full-span and legacy old opens, offset overlap and topic aliases under the padded native date guard', async () => {
  const { repo, pages, record, queries } = nativePageFixture();
  pages.push([
    record('span', {
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-12-01T00:00:00Z',
    }),
    record('null-open', { startedAt: '2026-01-01T00:00:00Z', endedAt: null }),
    record('missing-open', {
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: undefined,
    }),
    record('offset', {
      startedAt: '2026-10-09T23:00:00+23:59',
      endedAt: '2026-10-09T23:30:00+23:59',
    }),
    record('outside', { startedAt: '2026-10-10T00:00:00Z', endedAt: null }),
    record('topic-other', { topics: [{ topicId: 'other' }] }),
  ]);
  const result = await repo.readPage('project', 10, undefined, 'alice', {
    ...period,
    topicId: 'current',
  });
  expect(result?.records.map((row) => row.id)).toEqual([
    'span',
    'null-open',
    'missing-open',
    'offset',
  ]);
  expect(queries[0]!.where).toEqual({
    compositeFilter: { op: 'AND', filters: queryFilters(false) },
  });
  expect(result?.nextCursor).toBeNull();
});

it('keeps the personal native owner selector and rejects cached noncanonical owner paths', async () => {
  const { repo, pages, record, queries } = nativePageFixture(true);
  pages.push([
    record('foreign-path', {}, 'users/bob/records/foreign-path'),
    record('owner'),
  ]);
  const result = await repo.readPage('project', 10, undefined, 'alice', period);
  expect(result?.records.map((row) => row.id)).toEqual(['owner']);
  expect(queries[0]!.where).toEqual({
    compositeFilter: { op: 'AND', filters: queryFilters(true) },
  });
});

it('rejects a dated cursor from a different candidate envelope before reading records', async () => {
  const { repo, pages, record, get } = nativePageFixture();
  pages.push([record('a'), record('b')]);
  const first = await repo.readPage('project', 1, undefined, 'alice', period);
  await expect(
    repo.readPage('project', 1, first!.nextCursor!, 'alice', {
      ...period,
      to: '2026-10-10T00:00:00Z',
    }),
  ).rejects.toThrow('Invalid dated report cursor');
  expect(get).toHaveBeenCalledTimes(1);
});
