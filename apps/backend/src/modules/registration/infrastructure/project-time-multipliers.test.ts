import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreProjectManagementRepository } from './firestore-project-management.js';
function fixture(extra: Record<string, unknown> = {}) {
  const values = new Map<string, Record<string, unknown>>([
    [
      'projects/p',
      {
        id: 'p',
        type: 'personal',
        createdBy: 'alice',
        archived: false,
        ...extra,
      },
    ],
  ]);
  interface Ref {
    path: string;
    collection: (name: string) => { doc: (id: string) => Ref };
  }
  const ref = (path: string): Ref => ({
    path,
    collection: (name) => ({ doc: (id) => ref(path + '/' + name + '/' + id) }),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(name + '/' + id),
    }),
    runTransaction: async (callback: (tx: unknown) => unknown) =>
      await callback({
        get: (r: { path: string }) =>
          Promise.resolve({
            exists: values.has(r.path),
            data: () => values.get(r.path),
          }),
        update: (r: { path: string }, patch: Record<string, unknown>) =>
          values.set(r.path, { ...values.get(r.path), ...patch }),
        create: (r: { path: string }, data: Record<string, unknown>) =>
          values.set(r.path, data),
      }),
  } as unknown as Firestore;
  return { repo: new FirestoreProjectManagementRepository(db), values };
}
const input = {
  projectId: 'p',
  requestId: 'r',
  reason: 'Configurar',
  timeMultipliers: { alice: [{ multiplier: 0, effectiveFrom: null }] },
  expectedTimeMultipliers: null,
};
it('audits validated map, preserves ordinary edits and returns same receipt on retry', async () => {
  const { repo, values } = fixture();
  const result = await repo.updateProject(input, 'alice');
  expect(values.get('projects/p')?.timeMultipliers).toEqual(
    input.timeMultipliers,
  );
  expect(values.get('projects/p')).not.toHaveProperty(
    'expectedTimeMultipliers',
  );
  expect(values.get('projects/p/audit/r')?.before).not.toHaveProperty(
    'timeMultipliers',
  );
  expect(await repo.updateProject(input, 'alice')).toEqual(result);
  await repo.updateProject(
    { projectId: 'p', requestId: 'title', reason: 'Editar', title: 'Novo' },
    'alice',
  );
  expect(values.get('projects/p')?.timeMultipliers).toEqual(
    input.timeMultipliers,
  );
  await expect(
    repo.updateProject({ ...input, requestId: 'stale' }, 'alice'),
  ).rejects.toThrow('Recarregue');
});
it('distinguishes absent from empty map and preserves personal ACL and writable state', async () => {
  await expect(
    fixture({ timeMultipliers: {} }).repo.updateProject(input, 'alice'),
  ).rejects.toThrow('Recarregue');
  await expect(fixture().repo.updateProject(input, 'bob')).rejects.toThrow();
  for (const state of [
    { archived: true },
    { mergeLock: 'job' },
    { mergedInto: 'other' },
  ])
    await expect(
      fixture(state).repo.updateProject(input, 'alice'),
    ).rejects.toThrow();
  await expect(
    fixture().repo.updateProject(
      { ...input, expectedTimeMultipliers: undefined },
      'alice',
    ),
  ).rejects.toThrow();
  await expect(
    fixture().repo.updateProject(
      {
        ...input,
        timeMultipliers: {
          alice: [{ multiplier: Infinity, effectiveFrom: null }],
        },
      },
      'alice',
    ),
  ).rejects.toThrow();
});
