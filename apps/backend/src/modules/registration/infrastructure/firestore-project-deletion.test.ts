import { describe, it, expect, vi } from 'vitest';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  FirestoreProjectDeletionRepository,
  jsonValue,
} from './firestore-project-deletion.js';
import { projectDeletionHandler } from '../presentation/project-deletion.js';

function fixture(type: string = 'work') {
  const data = new Map<string, Record<string, unknown>>([
    [
      'projects/p',
      { createdBy: 'alice', type, topics: [{ id: 'general' }], title: 'P' },
    ],
    [
      'users/alice/records/r',
      {
        projectId: 'p',
        uid: 'alice',
        originalText: 'original',
        deletedAt: '2026-01-01',
      },
    ],
    [
      'users/bob/records/b',
      { projectId: 'p', uid: 'bob', interpretation: 'other author' },
    ],
    [
      'users/alice/records/r/audit/a',
      { before: { projectId: 'p' }, reason: 'edit' },
    ],
    ['projects/p/topicMerges/t', { originals: ['one', 'two'] }],
    ['projects/p/audit/a', { reason: 'archive' }],
    ['users/alice/pauseAudits/a', { projectId: 'p' }],
    ['users/alice/splitAudits/a', { beforeSource: { projectId: 'p' } }],
    ['users/alice/removalAudits/a', { before: { projectId: 'p' } }],
    ['recordMovements/a', { projects: [{ path: 'projects/p' }] }],
    [
      'project_merge_jobs/a',
      { sourceProjectId: 'p', targetProjectId: 'p', status: 'completed' },
    ],
    ['projects/q', { createdBy: 'bob', type: 'work' }],
    ['users/bob/records/q', { projectId: 'q' }],
  ]);
  let failCommit = false;
  const ref = (path: string) => ({
    path,
    listCollections: () =>
      Promise.resolve(
        [
          ...new Set(
            [...data.keys()]
              .filter((p) => p.startsWith(path + '/'))
              .map((p) => p.slice(path.length + 1).split('/')[0]),
          ),
        ].map((id) => ({ id })),
      ),
  });
  const snap = (path: string) => ({
    exists: data.has(path),
    data: () => data.get(path),
    ref: ref(path),
    createTime: Timestamp.fromMillis(1),
    updateTime: Timestamp.fromMillis(2),
  });
  type Ref = ReturnType<typeof ref>;
  type Snap = ReturnType<typeof snap>;
  type Query = {
    name: string;
    group: boolean;
    limitN: number;
    filter?: [string, unknown];
    limit(n: number): Query;
    where(key: string, op: string, value: unknown): Query;
  };
  type Tx = {
    get(r: Ref | Query): Promise<Snap | { docs: Snap[] }>;
    create(r: Ref, value: Record<string, unknown>): number;
    delete(r: Ref): number;
  };
  const query = (
    name: string,
    group: boolean,
    limit = Infinity,
    filter?: [string, unknown],
  ): Query => ({
    name,
    group,
    limitN: limit,
    filter,
    limit: (n: number) => query(name, group, n, filter),
    where: (key: string, _op: string, v: unknown) =>
      query(name, group, limit, [key, v]),
  });
  const db = {
    doc: ref,
    collection: (name: string) => query(name, false),
    collectionGroup: (name: string) => query(name, true),
    runTransaction: async (fn: (tx: Tx) => Promise<unknown>) => {
      const writes: Array<() => void> = [];
      const result = await fn({
        get: (r: Ref | Query) =>
          Promise.resolve(
            'path' in r
              ? snap(r.path)
              : {
                  docs: [...data.keys()]
                    .filter(
                      (p) =>
                        (r.group
                          ? p.split('/').at(-2) === r.name
                          : p.split('/').length === 2 &&
                            p.split('/')[0] === r.name) &&
                        (!r.filter ||
                          data.get(p)![r.filter[0]] === r.filter[1]),
                    )
                    .slice(0, r.limitN)
                    .map(snap),
                },
          ),
        create: (r: Ref, v: Record<string, unknown>) =>
          writes.push(() => data.set(r.path, v)),
        delete: (r: Ref) => writes.push(() => data.delete(r.path)),
      });
      if (failCommit) throw new Error('simulated atomic commit rejection');
      writes.forEach((w) => w());
      return result;
    },
  } as unknown as Firestore;
  return {
    data,
    repo: new FirestoreProjectDeletionRepository(db, () => 100),
    fail: () => {
      failCommit = true;
    },
  };
}
const auth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
describe('frontend-only project permanent deletion', () => {
  it.each([
    ['projects/q', { createdBy: 'bob', type: 'work', mergedInto: 'p' }],
    [
      'recordMovements/cross',
      { result: { project_origin: 'p', project_target: 'q' } },
    ],
    [
      'projects/p/audit/cross',
      { before: { id: 'q', createdBy: 'bob', topics: [] } },
    ],
  ] as const)(
    'refuses linked foreign data at %s without any writes',
    async (path, data) => {
      const f = fixture();
      f.data.set(path, data);
      const before = [...f.data.entries()];
      await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
        code: 'failed-precondition',
      });
      expect([...f.data.entries()]).toEqual(before);
    },
  );
  it('requires authenticated verified corporate Google identity before repository access', async () => {
    const repo = { exportProject: vi.fn(), deleteProject: vi.fn() };
    await expect(
      projectDeletionHandler(repo, 'export', { projectId: 'p' }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    for (const token of [
      { ...auth.token, email: 'a@example.com' },
      { ...auth.token, email_verified: false },
      { ...auth.token, firebase: { sign_in_provider: 'password' } },
    ])
      await expect(
        projectDeletionHandler(
          repo,
          'export',
          { projectId: 'p' },
          { uid: 'alice', token },
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(repo.exportProject).not.toHaveBeenCalled();
  });
  it.each(['work', 'personal'])(
    'requires creator ownership for %s, not corporate membership',
    async (type) => {
      const f = fixture(type);
      await expect(f.repo.exportProject('p', 'bob')).rejects.toMatchObject({
        code: 'permission-denied',
      });
      expect(
        [...f.data.keys()].some((p) => p.startsWith('projectDeletionExports/')),
      ).toBe(false);
    },
  );
  it('rejects missing token, missing confirmation and missing download attestation', async () => {
    const f = fixture();
    for (const data of [
      { projectId: 'p' },
      { projectId: 'p', snapshotToken: 'a'.repeat(64), confirmed: true },
      { projectId: 'p', snapshotToken: 'a'.repeat(64), downloadAttested: true },
    ])
      await expect(
        projectDeletionHandler(f.repo, 'delete', data, auth),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      f.repo.deleteProject('p', 'alice', 'a'.repeat(64)),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('exports complete project, softdeleted and other-author work records, metadata and all related audits', async () => {
    const f = fixture();
    const exported = await f.repo.exportProject('p', 'alice');
    expect(exported.documentCount).toBe(11);
    expect(exported.export.includesSoftDeleted).toBe(true);
    expect(
      exported.export.documents.find((d) => d.path === 'users/alice/records/r')!
        .data,
    ).toMatchObject({ originalText: 'original', deletedAt: '2026-01-01' });
    expect(
      exported.export.documents.find((d) => d.path === 'users/bob/records/b')!
        .data,
    ).toMatchObject({ interpretation: 'other author' });
    expect(
      exported.export.documents.every((d) => d.createTime && d.updateTime),
    ).toBe(true);
    expect(exported.snapshotToken).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each(['edit', 'newrecord', 'newaudit', 'owner'])(
    'fails closed on snapshot drift (%s)',
    async (kind) => {
      const f = fixture();
      const e = await f.repo.exportProject('p', 'alice');
      if (kind === 'edit')
        f.data.get('users/alice/records/r')!.originalText = 'changed';
      if (kind === 'newrecord')
        f.data.set('users/bob/records/new', { projectId: 'p' });
      if (kind === 'newaudit')
        f.data.set('projects/p/audit/new', { reason: 'new' });
      if (kind === 'owner') f.data.get('projects/p')!.createdBy = 'bob';
      const before = [...f.data.entries()];
      await expect(
        f.repo.deleteProject('p', 'alice', e.snapshotToken),
      ).rejects.toMatchObject({
        code: kind === 'owner' ? 'permission-denied' : 'failed-precondition',
      });
      expect([...f.data.entries()]).toEqual(before);
    },
  );
  it('physically deletes all project records/subcollections/audits/receipts without touching unrelated data', async () => {
    const f = fixture();
    const e = await f.repo.exportProject('p', 'alice');
    await f.repo.exportProject('p', 'alice');
    expect(await f.repo.deleteProject('p', 'alice', e.snapshotToken)).toEqual({
      projectId: 'p',
      deleted: true,
      deletedDocumentCount: 11,
    });
    expect([...f.data.keys()].sort()).toEqual([
      'projects/q',
      'users/bob/records/q',
    ]);
  });
  it('preserves every document when atomic commit fails', async () => {
    const f = fixture();
    const e = await f.repo.exportProject('p', 'alice');
    const before = [...f.data.entries()];
    f.fail();
    await expect(
      f.repo.deleteProject('p', 'alice', e.snapshotToken),
    ).rejects.toThrow('atomic commit');
    expect([...f.data.entries()]).toEqual(before);
  });
  it('declines cross-project history and unknown subcollections without issuing incomplete export', async () => {
    for (const kind of ['cross', 'unknown']) {
      const f = fixture();
      if (kind === 'cross')
        f.data.get('users/alice/splitAudits/a')!.after = { projectId: 'q' };
      else f.data.set('projects/p/unknown/x', { value: 1 });
      await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
        code: 'failed-precondition',
      });
      expect(
        [...f.data.keys()].some((p) => p.startsWith('projectDeletionExports/')),
      ).toBe(false);
    }
  });
  it('declines overflow with no writes', async () => {
    const f = fixture();
    for (let i = 0; i < 1001; i++)
      f.data.set('users/a/records/x' + i, { projectId: 'q' });
    const before = [...f.data.entries()];
    await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    expect([...f.data.entries()]).toEqual(before);
  });
  it('retains Firestore nanosecond precision and non JSON primitives losslessly', () => {
    expect(jsonValue(new Timestamp(12, 34))).toEqual({
      $type: 'timestamp',
      seconds: 12,
      nanoseconds: 34,
    });
    expect(jsonValue(Buffer.from('backup'))).toEqual({
      $type: 'bytes',
      base64: 'YmFja3Vw',
    });
    expect(jsonValue(NaN)).toEqual({ $type: 'number', value: 'NaN' });
  });
});
