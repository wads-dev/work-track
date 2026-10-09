import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreProjectManagementRepository } from './firestore-project-management.js';
it('archives/unarchives legacy project audit once, rejects locks and merged reopen', async () => {
  const values = new Map<string, Record<string, unknown>>([
    ['projects/p', { id: 'p', title: 'Project', topics: [] }],
  ]);
  let writes = 0;
  interface Ref {
    path: string;
    collection: (name: string) => { doc: (id: string) => Ref };
  }
  const ref = (path: string): Ref => ({
    path,
    collection: (name) => ({ doc: (id) => ref(path + '/' + name + '/' + id) }),
  });
  const tx = {
    get: (r: Ref) =>
      Promise.resolve({
        exists: values.has(r.path),
        data: () => values.get(r.path),
      }),
    update: (r: Ref, v: Record<string, unknown>) => {
      writes++;
      values.set(r.path, { ...values.get(r.path), ...v });
    },
    create: (r: Ref, v: Record<string, unknown>) => {
      writes++;
      values.set(r.path, v);
    },
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(name + '/' + id),
    }),
    runTransaction: (work: (t: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as Firestore;
  const repo = new FirestoreProjectManagementRepository(db),
    input = {
      projectId: 'p',
      archived: true,
      reason: 'Pause project',
      requestId: 'archive1',
    };
  const result = await repo.archiveProject(input, 'alice');
  expect(values.get('projects/p')?.archived).toBe(true);
  expect(values.get('projects/p/audit/archive_archive1')).toMatchObject({
    before: { archived: false },
    after: { archived: true },
  });
  await expect(repo.archiveProject(input, 'alice')).resolves.toEqual(result);
  expect(writes).toBe(2);
  await repo.archiveProject(
    { ...input, archived: false, requestId: 'reopen1' },
    'alice',
  );
  expect(values.get('projects/p')?.archived).toBe(false);
  values.set('projects/p', {
    ...values.get('projects/p'),
    mergedInto: 'target',
  });
  await expect(
    repo.archiveProject(
      { ...input, archived: false, requestId: 'reopen2' },
      'alice',
    ),
  ).rejects.toThrow('mesclada');
  values.set('projects/p', { ...values.get('projects/p'), mergeLock: 'job' });
  await expect(
    repo.archiveProject({ ...input, requestId: 'blocked' }, 'alice'),
  ).rejects.toThrow('mesclagem');
});
