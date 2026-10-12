import { expect, it, vi } from 'vitest';
import { type Firestore, FieldPath } from 'firebase-admin/firestore';
import { appendSyncEvent, FirestoreSyncStore } from './firestore-sync.js';
function fixture() {
  const values = new Map<string, Record<string, unknown>>();
  let abort = false;
  const reads: string[] = [];
  const doc = (path: string) => ({ path, id: path.split('/').at(-1)! });
  const db = {
    doc,
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      const writes: Array<[string, Record<string, unknown>]> = [];
      let writing = false;
      await fn({
        get: (ref: { path: string }) => {
          expect(writing).toBe(false);
          reads.push(ref.path);
          const data = values.get(ref.path);
          return Promise.resolve({
            exists: data !== undefined,
            data: () => data,
          });
        },
        create: (ref: { path: string }, value: Record<string, unknown>) => {
          writing = true;
          expect(values.has(ref.path)).toBe(false);
          writes.push([ref.path, value]);
        },
        set: (ref: { path: string }, value: Record<string, unknown>) => {
          writing = true;
          writes.push([ref.path, value]);
        },
      });
      if (abort) throw new Error('abort');
      writes.forEach(([path, data]) => values.set(path, data));
    },
  };
  return {
    db: db as unknown as Firestore,
    values,
    reads,
    fail: () => {
      abort = true;
    },
    resume: () => {
      abort = false;
    },
  };
}
const path = 'users/alice/records/r';
const eventPath = (revision: number) =>
  'webSyncEvents/' + String(revision).padStart(16, '0');
it('late trigger reads canonical latest value and duplicate delivery does not lose a later change', async () => {
  const f = fixture();
  f.values.set(path, { projectId: 'p', version: 2 });
  await appendSyncEvent(f.db, 'new-delivery', path, 'p');
  await appendSyncEvent(f.db, 'old-delivery', path, 'p');
  expect(f.values.get(eventPath(1))?.data).toEqual({
    projectId: 'p',
    version: 2,
  });
  expect(f.values.get(eventPath(2))?.data).toEqual({
    projectId: 'p',
    version: 2,
  });
  f.values.set(path, { projectId: 'p', version: 3 });
  await appendSyncEvent(f.db, 'old-delivery', path, 'p');
  expect(f.values.get('webSyncState/head')).toEqual({ revision: 2 });
  await appendSyncEvent(f.db, 'third-delivery', path, 'p');
  expect(f.values.get(eventPath(3))?.data).toEqual({
    projectId: 'p',
    version: 3,
  });
});
it('delete and recreate ordering never resurrects old snapshot; moves retain private previous id', async () => {
  const f = fixture();
  await appendSyncEvent(f.db, 'delete', path, 'old');
  expect(f.values.get(eventPath(1))).toMatchObject({
    projectId: null,
    data: null,
    previousProjectId: 'old',
  });
  f.values.set(path, { projectId: 'new', version: 4 });
  await appendSyncEvent(f.db, 'late-old-write', path, 'old');
  expect(f.values.get(eventPath(2))).toMatchObject({
    projectId: 'new',
    previousProjectId: 'old',
    data: { version: 4 },
  });
  f.values.delete(path);
  await appendSyncEvent(f.db, 'late-recreate', path, 'new');
  expect(f.values.get(eventPath(3))?.data).toBeNull();
});
it('aborted transaction writes neither ledger nor head; retry journals canonical current data', async () => {
  const f = fixture();
  f.values.set(path, { projectId: 'p', version: 1 });
  f.fail();
  await expect(appendSyncEvent(f.db, 'delivery', path)).rejects.toThrow(
    'abort',
  );
  expect(f.values.size).toBe(1);
  f.resume();
  f.values.set(path, { projectId: 'p', version: 2 });
  await appendSyncEvent(f.db, 'delivery', path);
  expect(f.values.get(eventPath(1))?.data).toEqual({
    projectId: 'p',
    version: 2,
  });
  expect(f.reads).toContain(path);
});
it('project events use path identity, head contains only revision and invalid head fails without writes', async () => {
  const f = fixture();
  f.values.set('projects/p', { id: 'wrong', title: 'P' });
  await appendSyncEvent(f.db, 'project', 'projects/p');
  expect(f.values.get(eventPath(1))?.projectId).toBe('p');
  expect(f.values.get('webSyncState/head')).toEqual({ revision: 1 });
  f.values.set('webSyncState/head', { revision: Number.MAX_SAFE_INTEGER });
  const count = f.values.size;
  await expect(appendSyncEvent(f.db, 'overflow', path)).rejects.toThrow(
    'revision',
  );
  expect(f.values.size).toBe(count);
});
it('audit journal resolves project from canonical parent in the same transaction and hides deleted parents', async () => {
  const f = fixture();
  const auditPath = path + '/audit/a';
  f.values.set(path, { projectId: 'current' });
  f.values.set(auditPath, { projectId: 'untrusted', version: 2 });
  await appendSyncEvent(f.db, 'audit-write', auditPath);
  expect(f.values.get(eventPath(1))).toMatchObject({
    path: auditPath,
    projectId: 'current',
    data: { version: 2 },
  });
  expect(f.reads).toContain(path);
  f.values.set(path, { projectId: 'current', deletedAt: 'now' });
  await appendSyncEvent(f.db, 'audit-after-delete', auditPath);
  expect(f.values.get(eventPath(2))?.data).toBeNull();
  f.values.delete(path);
  await appendSyncEvent(f.db, 'audit-orphan', auditPath);
  expect(f.values.get(eventPath(3))).toMatchObject({
    projectId: null,
    data: null,
  });
});
it('repository uses bounded physical queries, revision cutoff and bootstrap full path cursor without updatedAt', async () => {
  const query = {
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    get: vi.fn(() => Promise.resolve({ docs: [] })),
  };
  for (const fn of [query.where, query.orderBy, query.limit, query.startAfter])
    fn.mockReturnValue(query);
  const db = {
    collection: vi.fn(() => query),
    collectionGroup: vi.fn(() => query),
    doc: vi.fn((path: string) => ({ path })),
  };
  const store = new FirestoreSyncStore(db as unknown as Firestore);
  await store.projects();
  expect(query.limit).toHaveBeenCalledWith(1001);
  await store.events(12, 44);
  expect(query.where.mock.calls).toEqual([
    ['revision', '>', 12],
    ['revision', '<=', 44],
  ]);
  expect(query.orderBy).toHaveBeenCalledWith('revision');
  await store.bootstrap('p', 'users/alice/records/r', 'alice');
  expect(db.collectionGroup).toHaveBeenCalledWith('records');
  expect(query.where).toHaveBeenCalledWith('projectId', '==', 'p');
  expect(query.orderBy).toHaveBeenCalledWith(FieldPath.documentId());
  expect(query.limit).toHaveBeenCalledWith(250);
  expect(query.startAfter).toHaveBeenCalledWith({
    path: 'users/alice/records/r',
  });
});

it('bootstrap reads bounded audits only for viewer active parents without extra record fetch', async () => {
  const auditQuery = { orderBy: vi.fn(), limit: vi.fn(), get: vi.fn() };
  auditQuery.orderBy.mockReturnValue(auditQuery);
  auditQuery.limit.mockReturnValue(auditQuery);
  auditQuery.get.mockResolvedValue({
    size: 21,
    docs: Array.from({ length: 21 }, (_, i) => ({
      ref: { path: path + '/audit/a' + i },
      data: () => ({ version: i }),
    })),
  });
  const ownCollection = vi.fn(() => auditQuery);
  const forbiddenCollection = vi.fn();
  const record = (
    refPath: string,
    data: Record<string, unknown>,
    collection: typeof ownCollection,
  ) => ({ ref: { path: refPath, collection }, data: () => data });
  const query = {
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    get: vi.fn(),
  };
  for (const fn of [query.where, query.orderBy, query.limit])
    fn.mockReturnValue(query);
  query.get.mockResolvedValue({
    docs: [
      record(path, { projectId: 'p' }, ownCollection),
      record('users/bob/records/r', { projectId: 'p' }, forbiddenCollection),
      record(
        'users/alice/records/deleted',
        { projectId: 'p', deletedAt: 'now' },
        forbiddenCollection,
      ),
    ],
  });
  const db = { collectionGroup: vi.fn(() => query) };
  const store = new FirestoreSyncStore(db as unknown as Firestore);
  const rows = await store.bootstrap('p', undefined, 'alice');
  expect(rows).toHaveLength(24);
  expect(rows.at(-1)?.data).toEqual({ version: 20 });
  expect(ownCollection).toHaveBeenCalledWith('audit');
  expect(forbiddenCollection).not.toHaveBeenCalled();
  expect(auditQuery.orderBy).toHaveBeenCalledWith(FieldPath.documentId());
  expect(auditQuery.limit).toHaveBeenCalledWith(1001);
  expect(query.get).toHaveBeenCalledTimes(1);
  auditQuery.get.mockResolvedValue({ size: 1001, docs: [] });
  await expect(store.bootstrap('p', undefined, 'alice')).rejects.toMatchObject({
    code: 'resource-exhausted',
  });
  query.get.mockResolvedValue({
    docs: [
      record(path, { projectId: 'p' }, ownCollection),
      record('users/alice/records/second', { projectId: 'p' }, ownCollection),
    ],
  });
  auditQuery.get.mockResolvedValue({ size: 600, docs: [] });
  await expect(store.bootstrap('p', undefined, 'alice')).rejects.toMatchObject({
    code: 'resource-exhausted',
  });
  expect(auditQuery.limit).toHaveBeenLastCalledWith(401);
  query.get.mockResolvedValue({
    docs: [
      record(
        path,
        { projectId: 'p', text: 'x'.repeat(5 * 1024 * 1024) },
        ownCollection,
      ),
    ],
  });
  await expect(store.bootstrap('p', undefined, 'alice')).rejects.toMatchObject({
    code: 'resource-exhausted',
  });
  query.get.mockResolvedValue({
    docs: [record(path, { projectId: 'p' }, ownCollection)],
  });
  auditQuery.get.mockResolvedValue({
    size: 1,
    docs: [
      {
        ref: { path: path + '/audit/large' },
        data: () => ({ text: 'x'.repeat(5 * 1024 * 1024) }),
      },
    ],
  });
  await expect(store.bootstrap('p', undefined, 'alice')).rejects.toMatchObject({
    code: 'resource-exhausted',
  });
});

it('ACL epoch survives revoke/regrant with same canonical scope and deduplicates retries', async () => {
  const f = fixture();
  const project = 'projects/p';
  const generation = 'webSyncProjectGenerations/p';
  f.values.set(project, { type: 'work', createdBy: 'alice' });
  await appendSyncEvent(f.db, 'initial', project);
  expect(f.values.get(generation)?.epoch).toBe(0);
  f.values.set(project, { type: 'work', createdBy: 'alice', title: 'edited' });
  await appendSyncEvent(f.db, 'metadata', project);
  expect(f.values.get(generation)?.epoch).toBe(0);
  // Both triggers arrive after a full revoke/regrant; canonical is work again.
  await appendSyncEvent(f.db, 'revoke', project, undefined, true);
  await appendSyncEvent(f.db, 'regrant', project, undefined, true);
  await appendSyncEvent(f.db, 'revoke', project, undefined, true);
  expect(f.values.get(generation)?.epoch).toBe(2);
  f.values.set(project, { type: 'personal', createdBy: 'bob' });
  await appendSyncEvent(f.db, 'scope-current', project);
  expect(f.values.get(generation)?.epoch).toBe(3);
  await appendSyncEvent(f.db, 'late-metadata', project);
  expect(f.values.get(generation)?.epoch).toBe(3);
});

it('project creation identity changes generation on offline delete/recreate without metadata churn', async () => {
  let created = new Date('2026-01-01');
  let epoch = 0;
  const db = {
    collection: () => ({
      limit: () => ({
        get: () =>
          Promise.resolve({
            docs: [
              {
                id: 'p',
                ref: { path: 'projects/p' },
                data: () => ({ type: 'work' }),
                createTime: { toDate: () => created },
              },
            ],
          }),
      }),
    }),
    doc: (path: string) => ({ path }),
    getAll: vi.fn(() => Promise.resolve([{ data: () => ({ epoch }) }])),
  };
  const store = new FirestoreSyncStore(db as unknown as Firestore);
  const first = (await store.projects())[0]!.generation;
  expect((await store.projects())[0]!.generation).toBe(first);
  created = new Date('2026-01-02');
  const recreated = (await store.projects())[0]!.generation;
  expect(recreated).not.toBe(first);
  epoch = 2;
  expect((await store.projects())[0]!.generation).not.toBe(recreated);
  expect(db.getAll).toHaveBeenCalledWith({
    path: 'webSyncProjectGenerations/p',
  });
});

it('currentRows batches deduplicated record/audit/parent paths and omits actual missing rows', async () => {
  const getAll = vi.fn((...refs: Array<{ path: string }>) =>
    Promise.resolve(
      refs.map((ref) => ({
        ref,
        exists: ref.path !== 'missing',
        data: () => ({ current: true }),
      })),
    ),
  );
  const store = new FirestoreSyncStore({
    doc: (path: string) => ({ path }),
    getAll,
  } as unknown as Firestore);
  expect(await store.currentRows([])).toEqual([]);
  const rows = await store.currentRows([
    path,
    path + '/audit/a',
    path,
    'missing',
  ]);
  expect(getAll).toHaveBeenCalledTimes(1);
  expect(getAll).toHaveBeenCalledWith(
    { path },
    { path: path + '/audit/a' },
    { path: 'missing' },
  );
  expect(rows).toHaveLength(2);
});
