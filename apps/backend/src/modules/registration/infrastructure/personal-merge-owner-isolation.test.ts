import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreProjectManagementRepository } from './firestore-project-management.js';
it('personal merge never reads or migrates foreign canonical or spoofed owner facts', async () => {
  const values = new Map<string, Record<string, unknown>>();
  const base = {
    title: 'Project',
    description: 'Project description long',
    topics: [{ id: 'general', title: 'Geral', description: 'Default' }],
    createdBy: 'alice',
    type: 'personal',
    createdAt: 'now',
  };
  values.set('projects/source', { ...base, id: 'source', confidential: true });
  values.set('projects/target', { ...base, id: 'target' });
  for (let i = 0; i < 101; i++)
    values.set('users/alice/records/r' + i, {
      uid: 'alice',
      projectId: 'source',
      topics: [{ topicId: 'general' }],
      originalText: 'evidence',
      recordedAt: 'immutable',
      requestId: 'intent',
      fingerprint: 'immutable',
    });
  values.set('users/bob/records/foreign', {
    uid: 'bob',
    projectId: 'source',
    topics: [{ topicId: 'general' }],
    originalText: 'foreign',
  });
  values.set('users/alice/records/spoof', {
    uid: 'bob',
    projectId: 'source',
    topics: [{ topicId: 'general' }],
    originalText: 'spoof',
  });
  interface Ref {
    path: string;
    id: string;
    collection: (n: string) => {
      doc: (id: string) => Ref;
      where: (field: string, op: string, value: string) => typeof query;
    };
    get: () => Promise<Snapshot>;
  }
  interface Snapshot {
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
  }
  const snapshot = (path: string): Snapshot => ({
    exists: values.has(path),
    data: () => values.get(path),
  });
  const ref = (path: string): Ref => ({
    path,
    id: path.split('/').at(-1)!,
    collection: (n) => ({
      doc: (id) => ref(path + '/' + n + '/' + id),
      where: () => {
        expect(path + '/' + n).toBe('users/alice/records');
        return query;
      },
    }),
    get: () => Promise.resolve(snapshot(path)),
  });
  const query = {
    query: true,
    n: Number.MAX_SAFE_INTEGER,
    get: () =>
      Promise.resolve({
        docs: [...values]
          .filter(
            ([path, data]) =>
              path.startsWith('users/alice/records/') &&
              data.uid === 'alice' &&
              path.split('/').length === 4 &&
              data.projectId === 'source',
          )
          .map(([path]) => ({ ref: ref(path), data: () => values.get(path) })),
      }),
    where: (field: string, op: string, value: string) => {
      expect([field, op, value]).toEqual(['uid', '==', 'alice']);
      return query;
    },
    limit: (n: number) => ({ query: true, n }),
    count: () => ({
      get: () =>
        Promise.resolve({
          data: () => ({
            count: [...values].filter(
              ([path, data]) =>
                path.startsWith('users/alice/records/') &&
                data.uid === 'alice' &&
                path.split('/').length === 4 &&
                data.projectId === 'source',
            ).length,
          }),
        }),
    }),
  };
  let writes = 0;
  const db = {
    collection: (n: string) => ({ doc: (id: string) => ref(n + '/' + id) }),
    collectionGroup: () => {
      throw Error('Personal merge must not read collectionGroup');
    },
    runTransaction: async (work: (tx: unknown) => Promise<unknown>) => {
      let written = false;
      const tx = {
        get: async (value: Ref | { query: boolean; n: number }) => {
          await Promise.resolve();
          if (written) throw Error('Read after write');
          if ('query' in value)
            return {
              docs: [...values]
                .filter(
                  ([path, data]) =>
                    path.startsWith('users/alice/records/') &&
                    data.uid === 'alice' &&
                    path.split('/').length === 4 &&
                    data.projectId === 'source',
                )
                .slice(0, value.n)
                .map(([path]) => ({
                  ref: ref(path),
                  data: () => values.get(path),
                })),
            };
          return snapshot(value.path);
        },
        update: (r: Ref, data: Record<string, unknown>) => {
          written = true;
          writes++;
          const next = { ...values.get(r.path), ...data };
          for (const [key, value] of Object.entries(data)) {
            if (
              value &&
              typeof value === 'object' &&
              value.constructor.name === 'DeleteTransform'
            )
              delete next[key];
          }
          values.set(r.path, next);
        },
        create: (r: Ref, data: Record<string, unknown>) => {
          written = true;
          writes++;
          if (values.has(r.path)) throw Error('Duplicate create');
          values.set(r.path, data);
        },
      };
      return work(tx);
    },
  } as unknown as Firestore;
  const repo = new FirestoreProjectManagementRepository(db);
  const input = {
    sourceProjectId: 'source',
    targetProjectId: 'target',
    confirmed: false,
  };
  await expect(repo.mergeProjects(input, 'alice')).resolves.toMatchObject({
    mode: 'preview',
    count: 101,
  });
  expect(writes).toBe(0);
  const execution = {
    ...input,
    confirmed: true,
    requestId: 'merge-one',
    reason: 'Explicit merge',
  };
  const first = await repo.mergeProjects(execution, 'alice');
  expect(first).toMatchObject({ status: 'running', migratedCount: 100 });
  expect(values.get('projects/target')?.confidential).toBe(true);
  expect(values.get('projects/source')?.mergeLock).toBeTruthy();
  const cancelled = await repo.mergeProjects(
    { ...execution, cancel: true },
    'alice',
  );
  expect(cancelled).toMatchObject({
    status: 'cancelled',
    migratedCount: 100,
    hasMore: false,
  });
  await expect(repo.mergeProjects(execution, 'alice')).rejects.toThrow(
    'cancelado',
  );
  const resumed = { ...execution, requestId: 'merge-two' };
  const remaining = values.get('users/alice/records/r100')!;
  values.set('users/alice/records/r100', {
    ...remaining,
    topics: [{ topicId: 'unknown' }],
  });
  await expect(repo.mergeProjects(resumed, 'alice')).rejects.toThrow(
    'não mapeado',
  );
  expect(values.get('projects/source')?.mergeLock).toBeTruthy();
  await expect(
    repo.mergeProjects({ ...resumed, cancel: true }, 'alice'),
  ).resolves.toMatchObject({ status: 'cancelled', migratedCount: 0 });
  expect(values.get('projects/source')).not.toHaveProperty('mergeLock');
  expect(values.get('projects/target')).not.toHaveProperty('mergeLock');
  values.set('users/alice/records/r100', remaining);
  const finalIntent = { ...execution, requestId: 'merge-three' };
  const second = await repo.mergeProjects(finalIntent, 'alice');
  expect(second).toMatchObject({ status: 'completed', migratedCount: 1 });
  const beforeReplay = writes;
  await expect(repo.mergeProjects(finalIntent, 'alice')).resolves.toEqual(
    second,
  );
  expect(writes).toBe(beforeReplay);
  expect(values.get('projects/source')).toMatchObject({
    archived: true,
    mergedInto: 'target',
  });
  expect(values.get('users/alice/records/r0')).toMatchObject({
    projectId: 'target',
    originalText: 'evidence',
    recordedAt: 'immutable',
    requestId: 'intent',
    fingerprint: 'immutable',
  });
  expect(
    [...values.keys()].filter((path) => path.includes('/audit/merge_')),
  ).toHaveLength(101);
  await expect(
    repo.mergeProjects({ ...execution, targetProjectId: 'other' }, 'alice'),
  ).rejects.toThrow('Projeto não encontrado.');
  expect(values.get('users/bob/records/foreign')).toMatchObject({
    projectId: 'source',
    originalText: 'foreign',
  });
  expect(values.get('users/alice/records/spoof')).toMatchObject({
    projectId: 'source',
    originalText: 'spoof',
  });
});
