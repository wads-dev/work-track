import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreWorkRepository } from './firestore-work.js';
import { FirestoreTopicManagementRepository } from './firestore-topic-management.js';
import { FirestoreProjectManagementRepository } from './firestore-project-management.js';
function fixture() {
  const data = new Map<string, Record<string, unknown>>();
  const snap = (path: string) => ({
    exists: data.has(path),
    id: path.split('/').at(-1),
    data: () => data.get(path),
  });
  const doc = (path: string): unknown => ({
    path,
    id: path.split('/').at(-1),
    get: () => Promise.resolve(snap(path)),
    collection: (name: string) => ({
      doc: (id: string) => doc(path + '/' + name + '/' + id),
    }),
  });
  const tx = {
    get: (ref: { path: string }) => Promise.resolve(snap(ref.path)),
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
    collectionGroup: () => ({
      where: () => ({
        count: () => {
          throw new Error('Count must not run before ACL');
        },
      }),
    }),
    runTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as Firestore;
  return { db, data };
}
it('namespaces personal creation by trusted owner and enforces ACL before topic/record/idempotent responses', async () => {
  const f = fixture(),
    repo = new FirestoreWorkRepository(f.db),
    base = {
      title: 'Same title',
      description: 'Synthetic project description long enough',
    };
  const a = await repo.createProject({ ...base, type: 'personal' }, 'alice'),
    b = await repo.createProject({ ...base, type: 'personal' }, 'bob'),
    w = await repo.createProject({ ...base, type: 'work' }, 'alice');
  expect(new Set([a.id, b.id, w.id]).size).toBe(3);
  expect((await repo.createProject({ ...base, type: 'work' }, 'bob')).id).toBe(
    w.id,
  );
  expect(
    (await repo.createProject({ ...base, type: 'personal' }, 'alice')).id,
  ).toBe(a.id);
  const input = {
    projectId: a.id,
    startedAt: '2026-10-01T00:00:00Z',
    timeZone: 'UTC',
    originalText: 'Start',
    interpretation: 'Start',
    requestId: 'retry',
  };
  for (const id of [a.id, 'missing']) {
    await expect(
      repo.createTopic(
        { projectId: id, title: 'Topic', description: 'Synthetic topic' },
        'bob',
      ),
    ).rejects.toThrow('Projeto');
    await expect(
      repo.register({ ...input, projectId: id }, 'bob'),
    ).rejects.toThrow('Projeto');
  }
  await repo.register(input, 'alice');
  f.data.set('projects/' + a.id, {
    ...f.data.get('projects/' + a.id),
    createdBy: 'bob',
  });
  await expect(repo.register(input, 'alice')).rejects.toMatchObject({
    code: 'not-found',
  });
});
it('blocks metadata, archives, topic audit access and merge preview before counts; rejects scope flip', async () => {
  const f = fixture();
  f.data.set('projects/p', {
    id: 'p',
    title: 'Private',
    type: 'personal',
    createdBy: 'alice',
    topics: [],
  });
  f.data.set('projects/w', {
    id: 'w',
    title: 'Work',
    type: 'work',
    topics: [],
  });
  f.data.set('projects/p/audit/update', {
    authorUid: 'bob',
    result: { secret: 'must not return' },
  });
  f.data.set('projects/p/audit/archive_archive', {
    authorUid: 'bob',
    result: { secret: 'must not return' },
  });
  const baselineSize = f.data.size;
  const management = new FirestoreProjectManagementRepository(f.db),
    topics = new FirestoreTopicManagementRepository(f.db);
  await expect(
    management.updateProject(
      {
        projectId: 'p',
        title: 'Changed',
        reason: 'Synthetic reason',
        requestId: 'update',
      },
      'bob',
    ),
  ).rejects.toMatchObject({ code: 'not-found' });
  await expect(
    management.archiveProject(
      {
        projectId: 'p',
        archived: true,
        reason: 'Synthetic reason',
        requestId: 'archive',
      },
      'bob',
    ),
  ).rejects.toMatchObject({ code: 'not-found' });
  await expect(
    topics.listTopicMerges({ projectId: 'p', limit: 20 }, 'bob'),
  ).rejects.toMatchObject({ code: 'not-found' });
  await expect(
    topics.mergeTopics(
      {
        projectId: 'p',
        sourceTopicIds: ['a'],
        targetTopicId: 'general',
        confirmed: false,
      },
      'bob',
    ),
  ).rejects.toMatchObject({ code: 'not-found' });
  await expect(
    management.mergeProjects(
      {
        sourceProjectId: 'p',
        targetProjectId: 'w',
        confirmed: false,
        cancel: false,
      },
      'bob',
    ),
  ).rejects.toMatchObject({ code: 'not-found' });
  await expect(
    management.mergeProjects(
      {
        sourceProjectId: 'p',
        targetProjectId: 'w',
        confirmed: false,
        cancel: false,
      },
      'alice',
    ),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(
    management.updateProject(
      {
        projectId: 'p',
        type: 'work',
        reason: 'Synthetic reason',
        requestId: 'flip',
      },
      'alice',
    ),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.data.size).toBe(baselineSize);
});
