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
  resolveRecordTopic,
  listingKey,
} from './browser-listing-repository';
it('rejects topic aliases without redirecting and retains records for truly removed topics', async () => {
  const project = mocks.docs.get('projects/p')!;
  mocks.docs.set('projects/p', {
    ...project,
    topics: [{ id: 'current', archived: false }],
  });
  for (const topicId of ['old', 'current', 'removed']) {
    record(topicId, {
      topics: [{ topicId }],
      topicSnapshots: [{ id: topicId, title: topicId }],
      startedAt: '2026-10-09T00:00:00Z',
      endedAt: '2026-10-09T01:00:00Z',
    });
  }
  const all = await readOwnRecordListing(db, 'alice', allowed);
  expect(all.total).toBe(3);
  const old = await readOwnRecordListing(db, 'alice', allowed, {
    topic: 'old',
  });
  expect(old.rows.map((row) => row.id)).toEqual(['old']);
  const aliasCatalog = [
    { id: 'old', mergedIntoTopicId: 'current', archived: true },
    { id: 'current', archived: false },
  ];
  expect(resolveRecordTopic(aliasCatalog, 'old')).toBeUndefined();
  mocks.docs.set('projects/p', { ...project, topics: aliasCatalog });
  expect(
    (await readOwnRecordListing(db, 'alice', allowed, { topic: 'old' })).total,
  ).toBe(0);
  expect(
    (await readOwnRecordListing(db, 'alice', allowed, { topic: 'current' }))
      .total,
  ).toBe(0);
  mocks.docs.set('projects/p', {
    ...project,
    topics: [{ id: 'current', archived: false }],
  });
  const current = await readOwnRecordListing(db, 'alice', allowed, {
    topic: 'current',
  });
  expect(current.rows.map((row) => row.id)).toEqual(['current']);
  const removed = await readOwnRecordListing(db, 'alice', allowed, {
    topic: 'removed',
  });
  expect(removed.rows.map((row) => row.id)).toEqual(['removed']);
  expect(removed.rows[0].data.topics).toEqual([{ topicId: 'removed' }]);
  expect(removed.rows[0].data.endedAt).toBe('2026-10-09T01:00:00Z');
});
const db = {} as Firestore;
const allowed = new Set(['p', 'existing', 'private', 'archived', 'revoked']);
const record = (id: string, data: Record<string, unknown> = {}) =>
  mocks.docs.set('users/alice/records/' + id, {
    endedAt: null,
    deletedAt: null,
    uid: 'alice',
    projectId: 'p',
    ...data,
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries.length = 0;
  mocks.docs.clear();
  mocks.docs.set('projects/p', {
    createdBy: 'alice',
    topics: [],
    archived: false,
    confidential: false,
    type: 'work',
    title: 'Public',
  });
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
it('pushes explicit active and archived project state into native cache', async () => {
  mocks.docs.set('projects/existing', {
    createdBy: 'alice',
    topics: [],
    archived: false,
    confidential: false,
    type: 'work',
    title: 'Existing',
  });
  mocks.docs.set('projects/private', {
    topics: [],
    archived: false,
    confidential: false,
    type: 'personal',
    createdBy: 'alice',
  });
  mocks.docs.set('projects/archived', {
    createdBy: 'alice',
    confidential: false,
    type: 'work',
    topics: [],
    archived: true,
  });
  const result = await readProjectListing(db, 'alice', allowed, {
    scope: 'work',
    archive: 'active',
  });
  expect(result.rows.map((r) => r.id)).toEqual(['p', 'existing']);
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
  ]);
  expect(mocks.trace).toHaveBeenCalledWith(
    'cache.result',
    expect.objectContaining({ count: 2 }),
  );
});
it('excludes missing project type from listings, direct reads and owner access', async () => {
  mocks.docs.set('projects/existing', { title: 'Untyped', createdBy: 'alice' });
  for (const scope of ['all', 'work', 'personal'] as const) {
    const result = await readProjectListing(db, 'alice', allowed, { scope });
    expect(result.rows.map((row) => row.id)).not.toContain('existing');
  }
  expect(
    (await readProjectListing(db, 'alice', allowed, { id: 'existing' })).rows,
  ).toEqual([]);
});
it('search uses masked display metadata, never hidden raw titles/descriptions/topics', async () => {
  mocks.docs.set('projects/private', {
    archived: false,
    confidential: true,
    type: 'personal',
    createdBy: 'alice',
    title: 'secret',
    description: 'secret',
    topics: [{ title: 'secret', archived: false }],
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
  mocks.docs.set('projects/revoked', {
    topics: [],
    archived: false,
    confidential: false,
    type: 'personal',
    createdBy: 'bob',
  });
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
      { field: 'projectId', op: 'in', value: ['p'] },
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
it('retains offset/date-spanning/open existing records and paginates complete selected history', async () => {
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
    createdBy: 'alice',
    archived: false,
    type: 'work',
    confidential: true,
    topics: [{ id: 't', title: 'Secret topic', archived: false }],
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
it('pushes closed/open state natively and rejects absent ends', async () => {
  record('missing', { endedAt: undefined });
  record('null', { endedAt: null });
  record('closed', {
    startedAt: '2026-10-01T00:00:00Z',
    endedAt: '2026-10-20T00:00:00Z',
  });
  expect(
    (
      await readOwnRecordListing(db, 'alice', allowed, { openOnly: true })
    ).rows.map((r) => r.id),
  ).toEqual(['null']);
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
    mocks.docs.set('projects/' + id, {
      createdBy: 'alice',
      type: 'work',
      topics: [],
      archived: false,
      confidential: false,
    });
    record(id, { projectId: id });
  }
  const result = await readOwnRecordListing(db, 'alice', ids, {
    page: 1,
    size: 50,
  });
  expect(result.total).toBe(65);
  expect(result.rows).toHaveLength(15);
  expect(mocks.queries).toHaveLength(7);
  for (const target of mocks.queries)
    expect(
      (target.clauses.find((c) => c.field === 'projectId')?.value as string[])
        .length,
    ).toBeLessThanOrEqual(10);
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

it('retains canonical archived merged projects and excludes them from active selection', async () => {
  mocks.docs.set('projects/existing', {
    createdBy: 'alice',
    topics: [],
    archived: true,
    confidential: false,
    type: 'work',
    title: 'merged',
    mergedInto: 'p',
  });
  const active = await readProjectListing(db, 'alice', allowed, {
    archive: 'active',
  });
  expect(active.rows.map((r) => r.id)).not.toContain('existing');
  const archived = await readProjectListing(db, 'alice', allowed, {
    archive: 'archived',
  });
  expect(archived.rows.map((r) => r.id)).toEqual(['existing']);
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
  record('old-missing', {
    startedAt: '2026-01-01T00:00:00Z',
    endedAt: undefined,
  });
  const result = await readOwnRecordListing(db, 'alice', allowed, {
    status: 'open',
    fromDate: '2026-10-08',
    toDate: '2026-10-08',
    zone: 'UTC',
    includeDeleted: false,
  });
  expect(result.rows.map((r) => r.id).sort()).toEqual(['old-null']);
  expect(
    mocks.queries.some((q) =>
      q.clauses.some((c) => c.field === 'startedAt' && c.op === '>='),
    ),
  ).toBe(false);
});

it('rejects missing archived/confidential state rather than defaulting it', async () => {
  mocks.docs.set('projects/existing', { type: 'work' });
  for (const archive of ['all', 'active', 'archived']) {
    expect(
      (await readProjectListing(db, 'alice', allowed, { archive })).rows.map(
        (r) => r.id,
      ),
    ).not.toContain('existing');
  }
});

it('chunks archived-only native branches with personal type selection before merging complete counts', async () => {
  const ids = new Set(Array.from({ length: 65 }, (_, i) => 'p' + i));
  for (const id of ids)
    mocks.docs.set('projects/' + id, {
      confidential: false,
      type: 'personal',
      createdBy: 'alice',
      topics: [],
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
  expect(mocks.queries).toHaveLength(3);
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

it('queries every explicit project shard and overlap branch before pagination', async () => {
  const ids = Array.from({ length: 23 }, (_, i) => 'selected-' + i);
  for (const id of [...ids, 'unselected']) {
    mocks.docs.set('projects/' + id, {
      createdBy: 'alice',
      type: 'work',
      topics: [],
      archived: false,
      confidential: false,
    });
    record(id, {
      projectId: id,
      startedAt: '2026-09-01T00:00:00Z',
      endedAt: '2026-11-01T00:00:00Z',
    });
    record(id + '-open', { projectId: id, startedAt: '2026-09-01T00:00:00Z' });
  }
  const result = await readOwnRecordListing(
    db,
    'alice',
    new Set([...ids, 'unselected']),
    {
      projectIds: [...ids, ids[0]],
      fromDate: '2026-10-01',
      toDate: '2026-10-02',
      size: 10,
      page: 4,
    },
  );
  expect(result.total).toBe(46);
  expect(result.rows).toHaveLength(6);
  expect(mocks.queries).toHaveLength(6);
  for (const target of mocks.queries) {
    const clause = target.clauses.find((c) => c.field === 'projectId')!;
    expect(clause.op).toBe('in');
    expect((clause.value as string[]).length).toBeLessThanOrEqual(10);
    expect(clause.value).not.toContain('unselected');
  }
});
it('fences project array selections canonically and rejects an unauthorized explicit project without broadening', async () => {
  expect(listingKey({ projectIds: ['b', 'a', 'b'] })).toBe(
    listingKey({ projectIds: ['a', 'b'] }),
  );
  expect(listingKey({ projectIds: ['a'] })).not.toBe(
    listingKey({ projectIds: ['b'] }),
  );
  record('visible');
  expect(
    (
      await readOwnRecordListing(db, 'alice', allowed, {
        projectIds: ['p', 'forbidden'],
      })
    ).total,
  ).toBe(0);
  expect(mocks.get).not.toHaveBeenCalled();
});

it('rejects over-limit and conflicting direct selections instead of silently broadening or truncating', async () => {
  const projectIds = Array.from({ length: 101 }, (_, i) => 'p' + i);
  expect(() => listingKey({ projectIds })).toThrow('100');
  await expect(
    readOwnRecordListing(db, '', new Set(), { projectIds }),
  ).rejects.toThrow('100');
  await expect(
    readOwnRecordListing(db, 'alice', allowed, {
      projectIds: ['p', 'private'],
      topic: 't',
    }),
  ).rejects.toThrow('exatamente um');
  await expect(
    readOwnRecordListing(db, 'alice', allowed, { projectIds: [], topic: 't' }),
  ).rejects.toThrow('exatamente um');
  await expect(
    readOwnRecordListing(db, 'alice', allowed, {
      projectIds: ['private'],
      project: 'p',
    }),
  ).rejects.toThrow('conflitante');
  expect(mocks.get).not.toHaveBeenCalled();
});
