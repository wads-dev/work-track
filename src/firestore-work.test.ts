import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreWorkRepository } from './firestore-work.js';
it('persists default topics and isolates idempotent records by user', async () => {
  const data = new Map<string, Record<string, unknown>>();
  const doc = (path: string): unknown => ({
    path,
    collection: (name: string) => ({
      doc: (id: string) => doc(path + '/' + name + '/' + id),
    }),
  });
  const tx = {
    get: (ref: { path: string }) =>
      Promise.resolve({
        exists: data.has(ref.path),
        data: () => data.get(ref.path),
      }),
    create: (ref: { path: string }, value: Record<string, unknown>) => {
      data.set(ref.path, value);
    },
    update: (ref: { path: string }, value: Record<string, unknown>) => {
      data.set(ref.path, { ...data.get(ref.path), ...value });
    },
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => doc(name + '/' + id),
    }),
    runTransaction: (work: (t: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as Firestore;
  const repo = new FirestoreWorkRepository(db);
  const project = await repo.createProject(
    {
      title: 'Work Track',
      description: 'Registro de atividades pessoais e profissionais.',
    },
    'alice',
  );
  expect(project.topics[0]?.id).toBe('general');
  const input = {
    projectId: project.id,
    startedAt: '2026-10-08T21:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
    originalText: 'Comecei agora',
    interpretation: 'Início sem fim',
    requestId: 'one',
  };
  const saved = await repo.register(input, 'alice');
  expect(saved.topics).toEqual([{ topicId: 'general' }]);
  expect(saved.endedAt).toBeUndefined();
  expect(saved.uid).toBe('alice');
  expect((await repo.register(input, 'alice')).duplicate).toBe(true);
  await expect(
    repo.register({ ...input, originalText: 'Different' }, 'alice'),
  ).rejects.toThrow('requestId');
  expect((await repo.register(input, 'bob')).duplicate).toBe(false);
  await expect(
    repo.register(
      { ...input, requestId: 'two', topics: [{ topicId: 'missing' }] },
      'alice',
    ),
  ).rejects.toThrow('Tópico');
  expect(
    [...data.keys()].some((path) => path.startsWith('users/alice/records/')),
  ).toBe(true);
});
