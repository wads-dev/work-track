import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  FirestoreProjectDeletionRepository,
  jsonValue,
  DELETION_INVENTORY_VERSION,
  DELETION_LIMITS,
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
  const queuedWrite = vi.fn();
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
        create: (r: Ref, v: Record<string, unknown>) => {
          queuedWrite();
          return writes.push(() => data.set(r.path, v));
        },
        delete: (r: Ref) => {
          queuedWrite();
          return writes.push(() => data.delete(r.path));
        },
      });
      if (failCommit) throw new Error('simulated atomic commit rejection');
      writes.forEach((w) => w());
      return result;
    },
  } as unknown as Firestore;
  return {
    data,
    queuedWrite,
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
const ledgerPath = 'users/alice/recordMergeAudits/op';
const projectionPath = 'projects/p/reportRecords/stable';
function ledger(uid = 'alice') {
  const source = {
    uid,
    projectId: 'p',
    originalText: 'source evidence',
    id: 'source',
  };
  const target = {
    uid,
    projectId: 'p',
    originalText: 'target evidence',
    id: 'target',
  };
  return {
    uid,
    operationId: 'op',
    requestId: 'request',
    reason: 'merge',
    before: { source, target },
    after: { source: { ...source, deletedAt: '2026-01-01' }, target },
    result: { source: { ...source, deletedAt: '2026-01-01' }, target },
  };
}
function seedNewInventory(f: ReturnType<typeof fixture>) {
  f.data.set(ledgerPath, ledger());
  f.data.set(projectionPath, {
    uid: 'alice',
    projectId: 'p',
    id: 'orphan',
    topics: [],
  });
}
function personalFixture() {
  const f = fixture('personal');
  f.data.delete('users/bob/records/b');
  return f;
}
describe('versioned bounded complete deletion inventory', () => {
  it('exports full nested merge evidence and orphan projection with times, then removes only associated data', async () => {
    const f = fixture();
    seedNewInventory(f);
    f.data.set('projects/q/reportRecords/other', {
      uid: 'bob',
      projectId: 'q',
    });
    f.data.set('users/bob/recordMergeAudits/other', {
      uid: 'bob',
      result: { source: { uid: 'bob', projectId: 'q' } },
    });
    const e = await f.repo.exportProject('p', 'alice');
    expect(e.documentCount).toBe(13);
    expect(e.schemaVersion).toBe(2);
    expect(e.inventoryVersion).toBe(DELETION_INVENTORY_VERSION);
    expect(e.export.version).toBe(2);
    expect(e.export.inventoryVersion).toBe(2);
    expect(e.export.documents.find((d) => d.path === ledgerPath)).toMatchObject(
      {
        data: ledger(),
        createTime: { seconds: 0, nanoseconds: 1_000_000 },
        updateTime: { seconds: 0, nanoseconds: 2_000_000 },
      },
    );
    expect(
      e.export.documents.find((d) => d.path === projectionPath)?.data,
    ).toEqual(f.data.get(projectionPath));
    const digest = createHash('sha256')
      .update(
        JSON.stringify({ inventoryVersion: 2, documents: e.export.documents }),
      )
      .digest('hex');
    expect(e.export.snapshotDigest).toBe(digest);
    expect(
      f.data.get('projectDeletionExports/' + e.snapshotToken),
    ).toMatchObject({ inventoryVersion: 2, digest });
    await f.repo.deleteProject('p', 'alice', e.snapshotToken);
    expect([...f.data.keys()].sort()).toEqual([
      'projects/q',
      'projects/q/reportRecords/other',
      'users/bob/recordMergeAudits/other',
      'users/bob/records/q',
    ]);
  });
  it.each(['before.source', 'after.target', 'result.source', 'result.target'])(
    'discovers nested-only membership %s',
    async (slot) => {
      const f = fixture();
      const [container, key] = slot.split('.');
      const value = {
        uid: 'alice',
        [container!]: { [key!]: { uid: 'alice', projectId: 'p' } },
      };
      f.data.set(ledgerPath, value);
      const e = await f.repo.exportProject('p', 'alice');
      expect(
        e.export.documents.find((d) => d.path === ledgerPath)?.data,
      ).toEqual(value);
    },
  );
  it.each(['before.source', 'after.target', 'result.source', 'result.target'])(
    'fails closed on nested cross-project %s without issuing receipt',
    async (slot) => {
      const f = fixture();
      const value = ledger();
      const [container, key] = slot.split('.');
      (
        value as unknown as Record<
          string,
          Record<string, { projectId: string }>
        >
      )[container!]![key!]!.projectId = 'q';
      f.data.set(ledgerPath, value);
      const before = structuredClone([...f.data]);
      await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
        code: 'failed-precondition',
      });
      expect([...f.data]).toEqual(before);
    },
  );
  it.each([undefined, 1, 3])(
    'rejects inventory version %s even when digest matches before inventory reads',
    async (version) => {
      const f = fixture();
      const e = await f.repo.exportProject('p', 'alice');
      const receipt = f.data.get('projectDeletionExports/' + e.snapshotToken)!;
      if (version === undefined) delete receipt.inventoryVersion;
      else receipt.inventoryVersion = version;
      // Would exceed scan bound if snapshot ran; version rejection must happen first.
      for (let i = 0; i < 1001; i++)
        f.data.set('users/bob/reportRecords/x' + i, { projectId: 'q' });
      const before = structuredClone([...f.data]);
      await expect(
        f.repo.deleteProject('p', 'alice', e.snapshotToken),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
      expect([...f.data]).toEqual(before);
    },
  );
  it.each([
    'ledger-add',
    'ledger-edit',
    'ledger-remove',
    'projection-add',
    'projection-edit',
    'projection-remove',
  ])('rejects new inventory drift %s atomically', async (kind) => {
    const f = fixture();
    if (!kind.endsWith('add')) seedNewInventory(f);
    const e = await f.repo.exportProject('p', 'alice');
    const path = kind.startsWith('ledger') ? ledgerPath : projectionPath;
    if (kind.endsWith('add')) seedNewInventory(f);
    else if (kind.endsWith('remove')) f.data.delete(path);
    else if (kind.startsWith('ledger'))
      (
        f.data.get(path)!.result as { target: { originalText: string } }
      ).target.originalText = 'changed saved result';
    else f.data.get(path)!.topics = ['changed'];
    const before = structuredClone([...f.data]);
    await expect(
      f.repo.deleteProject('p', 'alice', e.snapshotToken),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect([...f.data]).toEqual(before);
  });
  it('rejects newly mixed project ledger after export without writes', async () => {
    const f = fixture();
    seedNewInventory(f);
    const e = await f.repo.exportProject('p', 'alice');
    (
      f.data.get(ledgerPath)!.result as { target: { projectId: string } }
    ).target.projectId = 'q';
    const before = structuredClone([...f.data]);
    await expect(
      f.repo.deleteProject('p', 'alice', e.snapshotToken),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect([...f.data]).toEqual(before);
  });
  it.each([
    ['users/bob/recordMergeAudits/orphan', ledger('bob')],
    ['projects/p/reportRecords/orphan', { uid: 'bob', projectId: 'p' }],
    [ledgerPath, { uid: undefined, result: { source: { projectId: 'p' } } }],
    [ledgerPath, ledger('bob')],
    [
      ledgerPath,
      { uid: 'alice', before: { source: { uid: 'bob', projectId: 'p' } } },
    ],
    ['other/alice/recordMergeAudits/op', ledger()],
    ['users/alice/records/r/recordMergeAudits/op', ledger()],
    [projectionPath, { projectId: 'p' }],
    [projectionPath, { uid: 'bad/uid', projectId: 'p' }],
    ['users/alice/reportRecords/op', { uid: 'alice', projectId: 'p' }],
    ['projects/q/reportRecords/op', { uid: 'alice', projectId: 'p' }],
    ['projects/p/reportRecords/op', { uid: 'alice', projectId: 'q' }],
  ])(
    'rejects personal orphan or malformed identity at %s',
    async (path, value) => {
      const f = personalFixture();
      f.data.set(path, value);
      const before = structuredClone([...f.data]);
      await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
        code: 'failed-precondition',
      });
      expect([...f.data]).toEqual(before);
    },
  );
  it.each([
    [ledgerPath, { result: { source: { uid: 'alice', projectId: 'p' } } }],
    [ledgerPath, { uid: 'alice', before: { source: { projectId: 'p' } } }],
    [ledgerPath, { uid: 'alice', result: [], projectId: 'p' }],
    [ledgerPath, ledger('bob')],
    [projectionPath, { uid: '', projectId: 'p' }],
    ['other/alice/reportRecords/x', { uid: 'alice', projectId: 'p' }],
  ])(
    'validates associated work evidence identity at %s',
    async (path, value) => {
      const f = fixture();
      f.data.set(path, value);
      const before = structuredClone([...f.data]);
      await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
        code: 'failed-precondition',
      });
      expect([...f.data]).toEqual(before);
    },
  );
  it('rejects legacy omitted-inventory digest and expired/wrong-identity receipts', async () => {
    for (const kind of ['legacy', 'expired', 'uid', 'project']) {
      const f = fixture();
      const old = await f.repo.exportProject('p', 'alice');
      seedNewInventory(f);
      const receipt = f.data.get(
        'projectDeletionExports/' + old.snapshotToken,
      )!;
      if (kind === 'legacy') {
        delete receipt.inventoryVersion;
        receipt.digest = createHash('sha256')
          .update(JSON.stringify(old.export.documents))
          .digest('hex');
      } else if (kind === 'expired') receipt.expiresAt = 100;
      else if (kind === 'uid') receipt.uid = 'bob';
      else receipt.projectId = 'q';
      const before = structuredClone([...f.data]);
      await expect(
        f.repo.deleteProject('p', 'alice', old.snapshotToken),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
      expect([...f.data]).toEqual(before);
    }
  });
  it('allows same-project work ledger authored by another user, but not mixed private history', async () => {
    const f = fixture();
    f.data.set('users/bob/recordMergeAudits/op', ledger('bob'));
    const e = await f.repo.exportProject('p', 'alice');
    expect(e.documentCount).toBe(12);
    (
      f.data.get('users/bob/recordMergeAudits/op')!.result as {
        target: { projectId: string };
      }
    ).target.projectId = 'q';
    await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
  it.each([ledgerPath, projectionPath])(
    'rejects unknown child under %s',
    async (path) => {
      const f = fixture();
      seedNewInventory(f);
      f.data.set(path + '/unknown/x', { value: 1 });
      const before = structuredClone([...f.data]);
      await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
        code: 'failed-precondition',
      });
      expect([...f.data]).toEqual(before);
    },
  );
  it.each([
    [ledgerPath, 'audit'],
    [ledgerPath, 'records'],
    [projectionPath, 'audit'],
    [projectionPath, 'records'],
  ])(
    'rejects known child %s/%s without project metadata before export or deletion',
    async (path, group) => {
      const f = fixture();
      seedNewInventory(f);
      const childPath = path + '/' + group + '/child';
      const child = { reason: 'private child evidence' };
      f.data.set(childPath, child);
      const beforeExport = structuredClone([...f.data]);
      await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
        code: 'failed-precondition',
      });
      expect(f.queuedWrite).not.toHaveBeenCalled();
      expect([...f.data]).toEqual(beforeExport);

      f.data.delete(childPath);
      const exported = await f.repo.exportProject('p', 'alice');
      const receiptPath = 'projectDeletionExports/' + exported.snapshotToken;
      const receipt = structuredClone(f.data.get(receiptPath));
      f.queuedWrite.mockClear();
      f.data.set(childPath, child);
      const beforeDelete = structuredClone([...f.data]);
      await expect(
        f.repo.deleteProject('p', 'alice', exported.snapshotToken),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(f.queuedWrite).not.toHaveBeenCalled();
      expect([...f.data]).toEqual(beforeDelete);
      expect(f.data.get(receiptPath)).toEqual(receipt);
    },
  );
  it('preserves all expanded evidence and receipts on commit failure', async () => {
    const f = fixture();
    seedNewInventory(f);
    const e = await f.repo.exportProject('p', 'alice');
    const before = structuredClone([...f.data]);
    f.fail();
    await expect(
      f.repo.deleteProject('p', 'alice', e.snapshotToken),
    ).rejects.toThrow('atomic commit');
    expect([...f.data]).toEqual(before);
  });
  it.each(['recordMergeAudits', 'reportRecords'])(
    'retains global 1000 scan bound for %s',
    async (group) => {
      for (const count of [1000, 1001]) {
        const f = fixture();
        for (let i = 0; i < count; i++)
          f.data.set('users/bob/' + group + '/x' + i, { projectId: 'q' });
        const before = structuredClone([...f.data]);
        if (count === 1000)
          await expect(
            f.repo.exportProject('p', 'alice'),
          ).resolves.toMatchObject({ documentCount: 11 });
        else {
          await expect(
            f.repo.exportProject('p', 'alice'),
          ).rejects.toMatchObject({ code: 'resource-exhausted' });
          expect([...f.data]).toEqual(before);
        }
      }
    },
  );
  it.each([400, 401])(
    'retains associated document bound at %s',
    async (count) => {
      const f = fixture();
      for (let i = 11; i < count; i++)
        f.data.set('projects/p/reportRecords/x' + i, {
          uid: 'alice',
          projectId: 'p',
        });
      if (count === 400)
        await expect(f.repo.exportProject('p', 'alice')).resolves.toMatchObject(
          { documentCount: 400 },
        );
      else {
        const before = structuredClone([...f.data]);
        await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
          code: 'resource-exhausted',
        });
        expect([...f.data]).toEqual(before);
      }
    },
  );
  it.each([0, 1])(
    'retains exact JSON byte bound with expanded evidence (+%s)',
    async (extra) => {
      const f = fixture();
      seedNewInventory(f);
      const e = await f.repo.exportProject('p', 'alice');
      const size = Buffer.byteLength(JSON.stringify(e.export.documents));
      f.data.get(projectionPath)!.padding = '';
      // New property adds comma, quotes, colon and its empty value.
      f.data.get(projectionPath)!.padding = 'x'.repeat(
        DELETION_LIMITS.bytes - size - 13 + extra,
      );
      const before = structuredClone([...f.data]);
      if (extra === 0)
        await expect(f.repo.exportProject('p', 'alice')).resolves.toMatchObject(
          { documentCount: 13 },
        );
      else {
        await expect(f.repo.exportProject('p', 'alice')).rejects.toMatchObject({
          code: 'resource-exhausted',
        });
        expect([...f.data]).toEqual(before);
      }
    },
  );
  it.each([100, 101])('retains receipt bound %s', async (count) => {
    const f = fixture();
    const e = await f.repo.exportProject('p', 'alice');
    for (let i = 1; i < count; i++)
      f.data.set('projectDeletionExports/x' + i, { projectId: 'p' });
    const before = structuredClone([...f.data]);
    if (count === 100)
      await expect(
        f.repo.deleteProject('p', 'alice', e.snapshotToken),
      ).resolves.toMatchObject({ deleted: true });
    else {
      await expect(
        f.repo.deleteProject('p', 'alice', e.snapshotToken),
      ).rejects.toMatchObject({ code: 'resource-exhausted' });
      expect([...f.data]).toEqual(before);
    }
  });
  it.each([450, 451])(
    'retains combined document plus receipt bound %s',
    async (count) => {
      const f = fixture();
      for (let i = 11; i < 400; i++)
        f.data.set('projects/p/reportRecords/x' + i, {
          uid: 'alice',
          projectId: 'p',
        });
      const e = await f.repo.exportProject('p', 'alice');
      for (let i = 1; i < count - 400; i++)
        f.data.set('projectDeletionExports/x' + i, { projectId: 'p' });
      const before = structuredClone([...f.data]);
      if (count === 450)
        await expect(
          f.repo.deleteProject('p', 'alice', e.snapshotToken),
        ).resolves.toMatchObject({ deletedDocumentCount: 400 });
      else {
        await expect(
          f.repo.deleteProject('p', 'alice', e.snapshotToken),
        ).rejects.toMatchObject({ code: 'resource-exhausted' });
        expect([...f.data]).toEqual(before);
      }
    },
  );
});
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
