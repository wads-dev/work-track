import { expect, it } from 'vitest';

import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreTopicManagementRepository } from './firestore-topic-management.js';
it.each([
  'normal',
  'inbound-alias',
  'historical-alias',
  'participants',
  'percentages',
  'minutes',
  'ambiguous',
  'limit',
  'scan-limit',
  'foreign-personal',
])(
  'migrates and removes topics atomically with audit and retry protection: %s',
  async (scenario) => {
    const topics = ['general', 'a', 'b'].map((id) => ({
      id,
      title: id,
      description: 'Synthetic topic',
    }));
    const values = new Map<string, Record<string, unknown>>([
      ['projects/p', { id: 'p', type: 'work', topics }],
      [
        'users/u/records/r',
        {
          uid: 'u',
          projectId: 'p',
          topics: [{ topicId: 'a' }],
          topicSnapshots: [topics[1]],
        },
      ],
    ]);
    if (scenario === 'inbound-alias')
      values.set('projects/p', {
        id: 'p',
        type: 'work',
        topics: [
          ...topics,
          {
            id: 'old',
            title: 'Old',
            description: 'Alias',
            archived: true,
            mergedIntoTopicId: 'a',
          },
        ],
      });
    if (scenario === 'historical-alias') {
      values.set('projects/p', {
        id: 'p',
        type: 'work',
        topics: topics.map((t) =>
          t.id === 'a' ? { ...t, archived: true, mergedIntoTopicId: 'b' } : t,
        ),
      });
    }
    if (scenario === 'participants')
      values.set('users/v/records/other', {
        uid: 'v',
        projectId: 'p',
        topics: [{ topicId: 'a' }],
        deletedAt: '2026-01-01',
      });
    if (scenario === 'foreign-personal')
      values.set('projects/p', {
        id: 'p',
        topics,
        type: 'personal',
        createdBy: 'u',
      });
    if (scenario === 'foreign-personal')
      values.set('users/v/records/other', {
        uid: 'v',
        projectId: 'p',
        topics: [{ topicId: 'a' }],
      });
    const allocationKey =
      scenario === 'percentages' ? 'percentage' : 'durationMinutes';
    if (['percentages', 'minutes', 'ambiguous'].includes(scenario))
      values.set('users/u/records/r', {
        ...values.get('users/u/records/r'),
        topics:
          scenario === 'ambiguous'
            ? [{ topicId: 'a' }, { topicId: 'b' }]
            : [
                { topicId: 'a', [allocationKey]: 30 },
                { topicId: 'b', [allocationKey]: 20 },
              ],
      });
    if (['limit', 'scan-limit'].includes(scenario)) {
      for (let i = 1; i < (scenario === 'limit' ? 101 : 2001); i++)
        values.set('users/u/records/r' + i, {
          uid: 'u',
          projectId: 'p',
          topics: [{ topicId: scenario === 'limit' ? 'a' : 'b' }],
        });
    }
    const original = structuredClone(values.get('users/u/records/r'));
    let writes = 0;
    interface Ref {
      path: string;
      id: string;
      get: () => Promise<{
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
      }>;
      collection: (name: string) => { doc: (id: string) => Ref };
    }
    const ref = (path: string): Ref => ({
      path,
      id: path.split('/').at(-1)!,
      get: () =>
        Promise.resolve({
          exists: values.has(path),
          data: () => values.get(path),
        }),
      collection: (name) => ({
        doc: (id) => ref(path + '/' + name + '/' + id),
      }),
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
      collectionGroup: () => ({
        where: () => ({
          limit: () => ({
            get: () =>
              Promise.resolve({
                docs: [...values.entries()]
                  .filter(
                    ([path, data]) =>
                      path.startsWith('users/') &&
                      path.split('/').length === 4 &&
                      data.projectId === 'p',
                  )
                  .map(([path, data]) => ({
                    id: ref(path).id,
                    ref: ref(path),
                    data: () => data,
                  })),
              }),
          }),
        }),
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
    expect(await repo.mergeTopics(input, 'u')).toMatchObject({
      mode: 'preview',
    });
    expect(writes).toBe(0);
    const confirmed = {
      ...input,
      confirmed: true,
      reason: 'Equivalent topics',
      requestId: 'request1',
    };
    if (
      ['ambiguous', 'limit', 'scan-limit', 'foreign-personal'].includes(
        scenario,
      )
    ) {
      const initial = structuredClone(values);
      await expect(repo.mergeTopics(confirmed, 'u')).rejects.toThrow(
        scenario === 'ambiguous'
          ? 'ambíguas'
          : scenario === 'limit'
            ? '100 registros'
            : scenario === 'scan-limit'
              ? '2000 registros'
              : 'Propriedade inválida',
      );
      expect(writes).toBe(0);
      expect(values).toEqual(initial);
      return;
    }
    const expectedWrites = scenario === 'participants' ? 6 : 4;
    const result = await repo.mergeTopics(confirmed, 'u');
    expect(result).toMatchObject({ mode: 'execution', status: 'completed' });
    expect(writes).toBe(expectedWrites);
    expect(values.get('users/u/records/r')).toMatchObject({
      ...original,
      topics: ['percentages', 'minutes'].includes(scenario)
        ? [{ topicId: 'b', [allocationKey]: 50 }]
        : [{ topicId: 'b' }],
      topicSnapshots: [topics[2]],
    });
    expect(result).toMatchObject({
      migratedRecordCount: scenario === 'participants' ? 2 : 1,
      removedTopicIds: scenario === 'inbound-alias' ? ['a', 'old'] : ['a'],
    });
    expect(values.get('projects/p')!.topics).toEqual([topics[0], topics[2]]);
    expect(
      values.get(
        'users/u/records/r/edits/' + (result as { auditId: string }).auditId,
      )!.before,
    ).toEqual(original);
    const audit = [...values.entries()].find(([key]) =>
      key.includes('/topicMerges/'),
    )![1];
    expect(audit.before).toEqual(
      scenario === 'historical-alias'
        ? topics.map((t) =>
            t.id === 'a' ? { ...t, archived: true, mergedIntoTopicId: 'b' } : t,
          )
        : scenario === 'inbound-alias'
          ? [
              ...topics,
              {
                id: 'old',
                title: 'Old',
                description: 'Alias',
                archived: true,
                mergedIntoTopicId: 'a',
              },
            ]
          : topics,
    );
    if (scenario === 'participants')
      expect(values.get('users/v/records/other')).toMatchObject({
        uid: 'v',
        topics: [{ topicId: 'b' }],
        deletedAt: '2026-01-01',
      });
    expect(audit.after).toEqual([topics[0], topics[2]]);
    expect(await repo.mergeTopics(confirmed, 'u')).toEqual(result);
    expect(writes).toBe(expectedWrites);
    await expect(
      repo.mergeTopics({ ...confirmed, reason: 'Changed intent' }, 'u'),
    ).rejects.toThrow('requestId');
    await expect(
      repo.mergeTopics({ ...confirmed, requestId: 'newrequest' }, 'u'),
    ).rejects.toThrow('não existe');
    expect(writes).toBe(expectedWrites);
  },
);

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
