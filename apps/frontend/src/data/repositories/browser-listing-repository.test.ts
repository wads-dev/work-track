import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const mocks = vi.hoisted(() => ({
  queries: [] as {
    path: string;
    clauses: { field: string; op: string; value: unknown }[];
  }[],
  docs: new Map<string, Record<string, unknown>>(),
  get: vi.fn(),
  getDoc: vi.fn(),
  trace: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  documentId: () => '__name__',
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (ref: { path: string }, ...clauses: unknown[]) => ({
    ...ref,
    clauses,
  }),
  getDocsFromCache: mocks.get,
  getDocFromCache: mocks.getDoc,
}));
vi.mock('../sync/firestore-diagnostics', () => ({
  traceFirestore: mocks.trace,
}));
import {
  readProjectListing,
  readOwnRecordListing,
  createProjectOptionRepository,
} from './browser-listing-repository';
const db = {} as Firestore;
const allowed = new Set(['p', 'legacy', 'private', 'archived', 'revoked']);
const record = (id: string, data: Record<string, unknown> = {}) =>
  mocks.docs.set('users/alice/records/' + id, {
    uid: 'alice',
    projectId: 'p',
    ...data,
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries.length = 0;
  mocks.docs.clear();
  mocks.docs.set('projects/p', { type: 'work', title: 'Public' });
  mocks.getDoc.mockImplementation(async ({ path }: { path: string }) => ({
    exists: () => mocks.docs.has(path),
    data: () => mocks.docs.get(path),
  }));
  mocks.get.mockImplementation(
    async (target: (typeof mocks.queries)[number]) => {
      mocks.queries.push(target);
      const docs = [...mocks.docs]
        .filter(
          ([path, data]) =>
            path.startsWith(target.path + '/') &&
            path.split('/').length === target.path.split('/').length + 1 &&
            target.clauses.every((c) => {
              const value =
                c.field === '__name__' ? path.split('/').at(-1) : data[c.field];
              if (value === undefined) return false;
              if (c.op === 'in') return (c.value as unknown[]).includes(value);
              if (c.op === '==') return value === c.value;
              if (c.op === '>') return String(value) > String(c.value);
              if (c.op === '>=') return String(value) >= String(c.value);
              if (c.op === '<=') return String(value) <= String(c.value);
              return false;
            }),
        )
        .map(([path, data]) => ({
          id: path.split('/').at(-1)!,
          data: () => data,
        }));
      return { docs };
    },
  );
});
it('pushes supported project predicates into native cache and retains legacy absent fields', async () => {
  mocks.docs.set('projects/legacy', { title: 'Legacy' });
  mocks.docs.set('projects/private', { type: 'personal', createdBy: 'alice' });
  mocks.docs.set('projects/archived', { type: 'work', archived: true });
  const result = await readProjectListing(db, 'alice', allowed, {
    scope: 'work',
    archive: 'active',
  });
  expect(result.rows.map((r) => r.id)).toEqual(['p', 'legacy']);
  await readProjectListing(db, 'alice', allowed, {
    scope: 'personal',
    archive: 'archived',
  });
  expect(mocks.queries.slice(1).map((target) => target.clauses)).toEqual([
    [
      { field: '__name__', op: 'in', value: [...allowed] },
      { field: 'type', op: '==', value: 'personal' },
      { field: 'archived', op: '==', value: true },
    ],
    [
      { field: '__name__', op: 'in', value: [...allowed] },
      { field: 'type', op: '==', value: 'personal' },
      { field: 'mergedInto', op: '>=', value: '' },
    ],
  ]);
  expect(mocks.trace).toHaveBeenCalledWith(
    'cache.result',
    expect.objectContaining({ count: 4 }),
  );
});
it('search uses masked display metadata, never hidden raw titles/descriptions/topics', async () => {
  mocks.docs.set('projects/private', {
    confidential: true,
    type: 'personal',
    createdBy: 'alice',
    title: 'secret',
    description: 'secret',
    topics: [{ title: 'secret' }],
  });
  expect(
    (await readProjectListing(db, 'alice', allowed, { query: 'secret' })).rows,
  ).toEqual([]);
  expect(
    (
      await readProjectListing(db, 'alice', allowed, { query: 'reservado' })
    ).rows.map((r) => r.id),
  ).toEqual(['private']);
  expect(
    (
      await readProjectListing(db, 'alice', allowed, {
        query: 'secret',
        revealed: true,
      })
    ).total,
  ).toBe(1);
  const repo = createProjectOptionRepository(
    [{ id: 'p', label: 'Projeto reservado', searchText: 'secret' }],
    false,
  );
  expect(await repo.search('secret')).toEqual([]);
  expect(repo.read('p')?.label).toBe('Projeto reservado');
});
it('queries uid/project/ID/date guards and rechecks current parent ACL before exposure', async () => {
  record('a', {
    startedAt: '2026-10-01T00:00:00Z',
    endedAt: '2026-10-20T00:00:00Z',
  });
  record('other', { projectId: 'revoked' });
  mocks.docs.set('projects/revoked', { type: 'personal', createdBy: 'bob' });
  const result = await readOwnRecordListing(db, 'alice', allowed, {
    project: 'p',
    fromDate: '2026-10-09',
    toDate: '2026-10-09',
    revealed: true,
  });
  expect(result.rows.map((r) => r.id)).toEqual(['a']);
  expect(mocks.queries[0].clauses).toEqual(
    expect.arrayContaining([
      { field: 'uid', op: '==', value: 'alice' },
      { field: 'projectId', op: '==', value: 'p' },
      expect.objectContaining({ field: 'startedAt', op: '<=' }),
    ]),
  );
  expect(mocks.queries[0].clauses).not.toContainEqual(
    expect.objectContaining({ field: 'startedAt', op: '>=' }),
  );
  expect(
    (await readOwnRecordListing(db, 'alice', allowed, { id: 'other' })).rows,
  ).toEqual([]);
  expect(mocks.getDoc).toHaveBeenCalledWith({ path: 'projects/revoked' });
});
it('retains offset/date-spanning/open legacy records and paginates complete selected history', async () => {
  for (let i = 0; i < 151; i++)
    record(String(i).padStart(3, '0'), { originalText: 'match' });
  record('deleted', { deletedAt: '2026-10-09T00:00:00Z' });
  const result = await readOwnRecordListing(db, 'alice', allowed, {
    query: 'match',
    openOnly: true,
    includeDeleted: false,
    revealed: true,
    page: 2,
    size: 50,
  });
  expect(result.total).toBe(151);
  expect(result.rows).toHaveLength(50);
  expect(result.hasMore).toBe(true);
  expect(result.openCount).toBe(151);
  record('offset', { startedAt: '2026-10-10T01:00:00+14:00', endedAt: null });
  record('span', {
    startedAt: '2026-09-01T00:00:00-12:00',
    endedAt: '2026-11-01T00:00:00Z',
  });
  record('outside', { startedAt: '2026-10-10T00:00:00-03:00', endedAt: null });
  const date = await readOwnRecordListing(db, 'alice', allowed, {
    fromDate: '2026-10-09',
    toDate: '2026-10-09',
    revealed: true,
  });
  expect(date.rows.map((r) => r.id)).toEqual(['offset', 'span']);
});
it('does not allow hidden record text/topic membership to become a search oracle', async () => {
  mocks.docs.set('projects/p', {
    type: 'work',
    confidential: true,
    topics: [{ id: 't', title: 'Secret topic' }],
  });
  record('r', {
    originalText: 'Secret',
    topics: [{ topicId: 't' }],
    topicSnapshots: [{ id: 't', title: 'Secret topic' }],
  });
  expect(
    (await readOwnRecordListing(db, 'alice', allowed, { query: 'Secret' }))
      .total,
  ).toBe(0);
  expect(
    (await readOwnRecordListing(db, 'alice', allowed, { topic: 't' })).total,
  ).toBe(0);
  expect(
    (
      await readOwnRecordListing(db, 'alice', allowed, {
        query: 'Secret',
        revealed: true,
      })
    ).total,
  ).toBe(1);
});
it('rejects incomplete/reversed date selection before any DB read', async () => {
  await expect(
    readOwnRecordListing(db, 'alice', allowed, { fromDate: '2026-10-09' }),
  ).rejects.toThrow('duas datas');
  expect(mocks.get).not.toHaveBeenCalled();
});
it('pushes closed status/end guards and keeps legacy missing/null ends in open selection', async () => {
  record('missing');
  record('null', { endedAt: null });
  record('closed', {
    startedAt: '2026-10-01T00:00:00Z',
    endedAt: '2026-10-20T00:00:00Z',
  });
  expect(
    (
      await readOwnRecordListing(db, 'alice', allowed, { openOnly: true })
    ).rows.map((r) => r.id),
  ).toEqual(['missing', 'null']);
  const result = await readOwnRecordListing(db, 'alice', allowed, {
    status: 'closed',
    fromDate: '2026-10-09',
    toDate: '2026-10-09',
  });
  expect(result.rows.map((r) => r.id)).toEqual(['closed']);
  expect(mocks.queries.at(-1)?.clauses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: 'endedAt', op: '>' }),
      expect.objectContaining({ field: 'endedAt', op: '>=' }),
    ]),
  );
});
it('calculates pending age budget inside repository and preserves strict eight hour cutoff', async () => {
  record('old', { startedAt: '2026-10-09T00:00:00Z', endedAt: null });
  record('equal', { startedAt: '2026-10-09T04:00:00Z' });
  record('young', { startedAt: '2026-10-09T05:00:00Z' });
  record('closed', {
    startedAt: '2026-10-09T00:00:00Z',
    endedAt: '2026-10-09T01:00:00Z',
  });
  const result = await readOwnRecordListing(db, 'alice', allowed, {
    openOnly: true,
    alertOnly: true,
    now: Date.parse('2026-10-09T12:00:00Z'),
  });
  expect(result.rows.map((r) => r.id)).toEqual(['old']);
  expect(result.total).toBe(1);
  expect(mocks.queries[0].clauses).toContainEqual(
    expect.objectContaining({ field: 'startedAt', op: '<=' }),
  );
});
it('chunks native authorization ID constraints without silently limiting complete counts', async () => {
  const ids = new Set(Array.from({ length: 65 }, (_, i) => 'p' + i));
  for (const id of ids) {
    mocks.docs.set('projects/' + id, { type: 'work' });
    record(id, { projectId: id });
  }
  const result = await readOwnRecordListing(db, 'alice', ids, {
    page: 1,
    size: 50,
  });
  expect(result.total).toBe(65);
  expect(result.rows).toHaveLength(15);
  expect(mocks.queries).toHaveLength(3);
  for (const target of mocks.queries)
    expect(
      (target.clauses.find((c) => c.field === 'projectId')?.value as string[])
        .length,
    ).toBeLessThanOrEqual(30);
});
it('logs read/result counts for cache failures and never falls back remotely for missing parents', async () => {
  mocks.get.mockRejectedValueOnce(new Error('storage'));
  await expect(readOwnRecordListing(db, 'alice', allowed)).rejects.toThrow(
    'storage',
  );
  expect(mocks.trace).toHaveBeenCalledWith(
    'cache.result',
    expect.objectContaining({
      source: 'browser-listing',
      count: 0,
      failed: true,
    }),
  );
  record('r');
  mocks.getDoc.mockRejectedValueOnce({ code: 'unavailable' });
  expect((await readOwnRecordListing(db, 'alice', allowed)).rows).toEqual([]);
  expect(mocks.trace).toHaveBeenCalledWith(
    'cache.result',
    expect.objectContaining({
      source: 'browser-listing-acl',
      count: 0,
      failed: true,
    }),
  );
});

it('retains merged projects without archived flags and excludes them from active selection', async () => {
  mocks.docs.set('projects/legacy', { title: 'merged', mergedInto: 'p' });
  const active = await readProjectListing(db, 'alice', allowed, {
    archive: 'active',
  });
  expect(active.rows.map((r) => r.id)).not.toContain('legacy');
  const archived = await readProjectListing(db, 'alice', allowed, {
    archive: 'archived',
  });
  expect(archived.rows.map((r) => r.id)).toEqual(['legacy']);
});
it('covers writer-accepted offsets beyond fourteen hours without dropping civil-day overlap', async () => {
  record('offset', {
    startedAt: '2026-10-09T23:00:00+23:59',
    endedAt: '2026-10-09T23:30:00+23:59',
  });
  const result = await readOwnRecordListing(db, 'alice', allowed, {
    fromDate: '2026-10-08',
    toDate: '2026-10-08',
    zone: 'UTC',
    includeDeleted: false,
  });
  expect(result.rows.map((r) => r.id)).toContain('offset');
});

it('includes old still-open records crossing the whole selected period without a lower-start query', async () => {
  record('old-null', { startedAt: '2026-01-01T00:00:00Z', endedAt: null });
  record('old-missing', { startedAt: '2026-01-01T00:00:00Z' });
  const result = await readOwnRecordListing(db, 'alice', allowed, {
    status: 'open',
    fromDate: '2026-10-08',
    toDate: '2026-10-08',
    zone: 'UTC',
    includeDeleted: false,
  });
  expect(result.rows.map((r) => r.id).sort()).toEqual([
    'old-missing',
    'old-null',
  ]);
  expect(
    mocks.queries.some((q) =>
      q.clauses.some((c) => c.field === 'startedAt' && c.op === '>='),
    ),
  ).toBe(false);
});

it('queries archived flags and merge markers natively, deduplicates the union and validates marker types', async () => {
  const fixtures: Record<string, Record<string, unknown>> = {
    flag: { archived: true },
    both: { archived: true, mergedInto: 'p' },
    merged: { mergedInto: 'p' },
    empty: { mergedInto: '' },
    active: {},
    invalid: { mergedInto: { target: 'p' } },
    foreign: { type: 'personal', createdBy: 'bob', archived: true },
  };
  const ids = new Set(Object.keys(fixtures));
  for (const [id, data] of Object.entries(fixtures))
    mocks.docs.set('projects/' + id, data);
  mocks.docs.set('projects/not-authorized', { archived: true });
  const result = await readProjectListing(db, 'alice', ids, {
    archive: 'archived',
    size: 2,
    page: 1,
  });
  expect(result.total).toBe(4);
  expect(result.rows.map((row) => row.id)).toEqual(['merged', 'empty']);
  expect(result.hasMore).toBe(false);
  expect(mocks.queries).toHaveLength(2);
  expect(mocks.queries.map((target) => target.clauses)).toEqual([
    [
      { field: '__name__', op: 'in', value: [...ids] },
      { field: 'archived', op: '==', value: true },
    ],
    [
      { field: '__name__', op: 'in', value: [...ids] },
      { field: 'mergedInto', op: '>=', value: '' },
    ],
  ]);
});

it('chunks archived-only native branches with personal type selection before merging complete counts', async () => {
  const ids = new Set(Array.from({ length: 65 }, (_, i) => 'p' + i));
  for (const id of ids)
    mocks.docs.set('projects/' + id, {
      type: 'personal',
      createdBy: 'alice',
      archived: true,
      mergedInto: 'p',
    });
  const result = await readProjectListing(db, 'alice', ids, {
    scope: 'personal',
    archive: 'archived',
    size: 50,
    page: 1,
  });
  expect(result.total).toBe(65);
  expect(result.rows).toHaveLength(15);
  expect(mocks.queries).toHaveLength(6);
  for (const target of mocks.queries) {
    expect(target.clauses).toContainEqual({
      field: 'type',
      op: '==',
      value: 'personal',
    });
    expect((target.clauses[0].value as string[]).length).toBeLessThanOrEqual(
      30,
    );
    expect(target.clauses).toHaveLength(3);
  }
});

it('does not wrap near year9999 range candidates below valid four-digit facts', async () => {
  record('edge', {
    startedAt: '9999-12-30T12:00:00Z',
    endedAt: '9999-12-30T13:00:00Z',
  });
  const result = await readOwnRecordListing(db, 'alice', allowed, {
    fromDate: '9999-12-30',
    toDate: '9999-12-30',
    zone: 'UTC',
    includeDeleted: false,
  });
  expect(result.rows.map((r) => r.id)).toEqual(['edge']);
});
