import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreWorkRepository } from './firestore-work.js';
it('persists default topics and isolates idempotent records by user', async () => {
  const data = new Map<string, Record<string, unknown>>();
  const doc = (path: string): unknown => ({
    path,
    id: path.split('/').at(-1),
    collection: (name: string) => ({
      doc: (id: string) => doc(path + '/' + name + '/' + id),
    }),
  });
  const tx = {
    get: (ref: { path: string }) =>
      Promise.resolve({
        exists: data.has(ref.path),
        id: ref.path.split('/').at(-1),
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
  expect(
    (await repo.register({ ...input, closePrevious: false }, 'alice'))
      .duplicate,
  ).toBe(true);
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
  const confirmed = {
    ...input,
    requestId: 'confirmed-switch',
    startedAt: '2026-10-08T22:00:00-03:00',
    closePrevious: true,
    closedPreviousRecordId: saved.id as string,
    closePreviousReason: 'Usuário confirmou troca',
  };
  const switched = await repo.register(confirmed, 'alice');
  expect(switched.closedPreviousRecordId).toBe(saved.id);
  const previous = data.get('users/alice/records/' + String(saved.id));
  expect(previous).toMatchObject({
    endedAt: confirmed.startedAt,
    originalText: input.originalText,
    requestId: input.requestId,
  });
  const audits = [...data.keys()].filter((path) =>
    path.includes('/audit/close_'),
  );
  expect(audits).toHaveLength(1);
  expect((await repo.register(confirmed, 'alice')).duplicate).toBe(true);
  expect(
    [...data.keys()].filter((path) => path.includes('/audit/close_')),
  ).toHaveLength(1);
  await expect(
    repo.register(
      {
        ...confirmed,
        closePrevious: false,
        closedPreviousRecordId: undefined,
        closePreviousReason: undefined,
      },
      'alice',
    ),
  ).rejects.toThrow('requestId');
  expect(
    [...data.keys()].some((path) => path.startsWith('users/alice/records/')),
  ).toBe(true);
});
