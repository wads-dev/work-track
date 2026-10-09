import { expect, it } from 'vitest';

import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreTopicManagementRepository } from './firestore-topic-management.js';
it('preview performs no writes, execution is atomic alias/audit only and retries preserve history', async () => {
  const topics = ['general', 'a', 'b'].map((id) => ({
    id,
    title: id,
    description: 'Synthetic topic',
  }));
  const values = new Map<string, Record<string, unknown>>([
    ['projects/p', { id: 'p', topics }],
    [
      'users/u/records/r',
      {
        projectId: 'p',
        topics: [{ topicId: 'a' }],
        topicSnapshots: [topics[1]],
      },
    ],
  ]);
  const original = structuredClone(values.get('users/u/records/r'));
  let writes = 0;
  interface Ref {
    path: string;
    get: () => Promise<{
      exists: boolean;
      data: () => Record<string, unknown> | undefined;
    }>;
    collection: (name: string) => { doc: (id: string) => Ref };
  }
  const ref = (path: string): Ref => ({
    path,
    get: () =>
      Promise.resolve({
        exists: values.has(path),
        data: () => values.get(path),
      }),
    collection: (name) => ({ doc: (id) => ref(path + '/' + name + '/' + id) }),
  });
  const tx = {
    get: (r: Ref) => r.get(),
    update: (r: Ref, v: Record<string, unknown>) => {
      writes++;
      values.set(r.path, { ...values.get(r.path), ...v });
    },
    create: (r: Ref, v: Record<string, unknown>) => {
      if (values.has(r.path)) throw Error('exists');
      writes++;
      values.set(r.path, v);
    },
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(name + '/' + id),
    }),
    runTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as Firestore;
  const repo = new FirestoreTopicManagementRepository(db);
  const input = {
    projectId: 'p',
    sourceTopicIds: ['a'],
    targetTopicId: 'b',
    confirmed: false,
  };
  expect(await repo.mergeTopics(input, 'u')).toMatchObject({ mode: 'preview' });
  expect(writes).toBe(0);
  const confirmed = {
    ...input,
    confirmed: true,
    reason: 'Equivalent topics',
    requestId: 'request1',
  };
  const result = await repo.mergeTopics(confirmed, 'u');
  expect(result).toMatchObject({ mode: 'execution', status: 'completed' });
  expect(writes).toBe(2);
  expect(values.get('users/u/records/r')).toEqual(original);
  const audit = [...values.entries()].find(([key]) =>
    key.includes('/topicMerges/'),
  )![1];
  expect(audit.before).toEqual(topics);
  expect(audit.after).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'a',
        mergedIntoTopicId: 'b',
        archived: true,
        mergedBy: 'u',
      }),
    ]),
  );
  expect(await repo.mergeTopics(confirmed, 'u')).toEqual(result);
  expect(writes).toBe(2);
  await expect(
    repo.mergeTopics({ ...confirmed, reason: 'Changed intent' }, 'u'),
  ).rejects.toThrow('requestId');
  await expect(
    repo.mergeTopics({ ...confirmed, requestId: 'newrequest' }, 'u'),
  ).rejects.toThrow('já mesclada');
  expect(writes).toBe(2);
});

it('history returns a bounded page, opaque same-project cursor and no internal fingerprint/result', async () => {
  const records = ['a', 'b', 'c'].map((id) => ({
    id,
    projectId: 'p',
    authorUid: 'u',
    reason: 'Equivalent topics',
    recordedAt: '2026-10-01T00:00:00Z',
    before: [],
    after: [],
    sourceTopicIds: ['source'],
    targetTopicId: 'target',
    fingerprint: 'private',
    result: 'private',
  }));
  const docs = records.map((data) => ({
    id: data.id,
    exists: true,
    data: () => data,
  }));
  let start = '';
  let requested = 0;
  const query = {
    orderBy: () => query,
    limit: (n: number) => {
      requested = n;
      return query;
    },
    startAfter: (doc: { id: string }) => {
      start = doc.id;
      return query;
    },
    get: () =>
      Promise.resolve({
        docs: docs.filter((d) => d.id > start).slice(0, requested),
      }),
    doc: (id: string) => ({
      get: () =>
        Promise.resolve(docs.find((d) => d.id === id) ?? { exists: false }),
    }),
  };
  const db = {
    collection: () => ({
      doc: () => ({
        get: () =>
          Promise.resolve({ exists: true, data: () => ({ type: 'work' }) }),
        collection: () => query,
      }),
    }),
  } as unknown as Firestore;
  const repo = new FirestoreTopicManagementRepository(db);
  const first = await repo.listTopicMerges({ projectId: 'p', limit: 2 }, 'u');
  expect(requested).toBe(3);
  expect(first.items.map((a) => a.id)).toEqual(['a', 'b']);
  expect(first.nextCursor).toBe('b');
  expect(first.items[0]).not.toHaveProperty('fingerprint');
  expect(first.items[0]).not.toHaveProperty('result');
  const last = await repo.listTopicMerges(
    {
      projectId: 'p',
      limit: 2,
      cursor: first.nextCursor,
    },
    'u',
  );
  expect(last.items.map((a) => a.id)).toEqual(['c']);
  expect(last).not.toHaveProperty('nextCursor');
  await expect(
    repo.listTopicMerges(
      { projectId: 'p', limit: 2, cursor: 'otherproject' },
      'u',
    ),
  ).rejects.toThrow('não pertence');
});
