import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestorePauseRepository } from './firestore-pause.js';
const now = Date.parse('2026-10-09T15:00:00Z'),
  input = {
    resumedAt: '2026-10-09T15:00:00Z',
    durationMinutes: 30,
    requestId: 'pause-1',
    reason: 'Pausa almoço',
    originalUtterance: 'Pausei30min',
  };
interface Ref {
  path: string;
  id: string;
  collection: (name: string) => Collection;
}
interface Collection {
  query: string;
  path: string;
  doc: (id: string) => Ref;
  limit: () => { query: string };
}
function fixture() {
  const data = new Map<string, Record<string, unknown>>();
  const source = {
    id: 'source',
    uid: 'a',
    projectId: 'p',
    requestId: 'source',
    startedAt: '2026-10-09T13:00:00Z',
    timeZone: 'UTC',
    originalText: 'Original',
    interpretation: 'Trabalho',
    receivedAt: '2026-10-09T13:00:01Z',
    topics: [{ topicId: 'general', percentage: 100 }],
    projectSnapshot: { title: 'P' },
    topicSnapshots: [{ id: 'general', title: 'Geral' }],
  };
  data.set('users/a/records/source', source);
  data.set('projects/p', {
    id: 'p',
    type: 'personal',
    createdBy: 'a',
    topics: [{ id: 'general' }],
  });
  const ref = (path: string): Ref => ({
    path,
    id: path.split('/').at(-1)!,
    collection: (name: string) => collection(path + '/' + name),
  });
  const snapshot = (r: { path: string; id: string }) => ({
    exists: data.has(r.path),
    id: r.id,
    ref: r,
    data: () => data.get(r.path),
  });
  const collection = (path: string): Collection => ({
    query: path,
    path,
    doc: (id: string) => ref(path + '/' + id),
    limit: () => ({ query: path }),
  });
  let pending: (() => void)[] = [];
  const tx = {
    get: vi.fn(async (r: Ref | { query: string }) => {
      await Promise.resolve();
      return 'query' in r
        ? {
            docs: [...data.keys()]
              .filter(
                (k) =>
                  k.startsWith(r.query + '/') &&
                  k.split('/').length === r.query.split('/').length + 1,
              )
              .map((k) => snapshot(ref(k))),
          }
        : snapshot(r);
    }),
    update: vi.fn((r: Ref, p: Record<string, unknown>) =>
      pending.push(() => data.set(r.path, { ...data.get(r.path), ...p })),
    ),
    create: vi.fn((r: Ref, p: Record<string, unknown>) =>
      pending.push(() => data.set(r.path, structuredClone(p))),
    ),
  };
  const db = {
    collection,
    runTransaction: async (work: (t: typeof tx) => Promise<unknown>) => {
      pending = [];
      const result = await work(tx);
      for (const operation of pending) operation();
      return result;
    },
  } as unknown as Firestore;
  return { data, source, tx, repo: new FirestorePauseRepository(db) };
}
it('more than1000 malformed tombstones cannot starve or inflate implicit eligible limits', async () => {
  const f = fixture();
  for (let i = 0; i < 1001; i++)
    f.data.set('users/a/records/deleted' + i, {
      uid: 'a',
      deletedAt: false,
      startedAt: 'bad',
    });
  await expect(f.repo.registerPause(input, 'a', now)).resolves.toMatchObject({
    sourceRecordId: 'source',
  });
});
it('atomically preserves source evidence, resumes same context and retries exact intent', async () => {
  const f = fixture();
  const result = await f.repo.registerPause(input, 'a', now);
  expect(f.data.get('users/a/records/source')).toMatchObject({
    endedAt: '2026-10-09T14:30:00.000Z',
    originalText: 'Original',
    receivedAt: f.source.receivedAt,
  });
  const successor = f.data.get('users/a/records/' + result.successorRecordId);
  expect(successor).toMatchObject({
    startedAt: input.resumedAt,
    pausedFrom: 'source',
    topics: f.source.topics,
    projectSnapshot: f.source.projectSnapshot,
  });
  expect(successor).not.toHaveProperty('endedAt');
  expect(f.data.size).toBe(4);
  expect(await f.repo.registerPause(input, 'a', now + 86400000)).toEqual(
    result,
  );
  expect(f.tx.create).toHaveBeenCalledTimes(2);
  await expect(
    f.repo.registerPause({ ...input, durationMinutes: 20 }, 'a', now),
  ).rejects.toThrow('intenção diferente');
  f.data.get('users/a/records/' + result.successorRecordId)!.originalText =
    'Changed';
  await expect(f.repo.registerPause(input, 'a', now)).rejects.toThrow(
    'Estado alterado',
  );
});
it('rejects malformed UID/date/clock before database transaction', async () => {
  const f = fixture();
  for (const [payload, uid, clock] of [
    [input, 'bad/path', now],
    [{ ...input, resumedAt: 'invalid' }, 'a', now],
    [input, 'a', NaN],
  ] as const)
    await expect(f.repo.registerPause(payload, uid, clock)).rejects.toThrow();
  expect(f.tx.get).not.toHaveBeenCalled();
});
it('does not choose multiple eligible records or write anything on failure', async () => {
  const f = fixture();
  f.data.set('users/a/records/other', { ...f.source, id: 'other' });
  await expect(f.repo.registerPause(input, 'a', now)).rejects.toMatchObject({
    candidates: [
      { recordId: 'source', startedAt: f.source.startedAt },
      { recordId: 'other', startedAt: f.source.startedAt },
    ],
  });
  expect(f.tx.update).not.toHaveBeenCalled();
  expect(f.tx.create).not.toHaveBeenCalled();
  expect(
    (await f.repo.registerPause({ ...input, recordId: 'source' }, 'a', now))
      .sourceRecordId,
  ).toBe('source');
});
it('fails closed for no eligible, foreign project, future, missing source and absolute allocations', async () => {
  for (const kind of ['closed', 'foreign', 'future', 'missing', 'allocation']) {
    const f = fixture();
    if (kind === 'closed')
      f.data.get('users/a/records/source')!.endedAt = input.resumedAt;
    if (kind === 'foreign') f.data.get('projects/p')!.createdBy = 'b';
    if (kind === 'allocation')
      f.data.get('users/a/records/source')!.topics = [
        { topicId: 'general', durationMinutes: 20 },
      ];
    await expect(
      f.repo.registerPause(
        {
          ...input,
          ...(kind === 'future' ? { resumedAt: '2026-10-09T16:00:00Z' } : {}),
          ...(kind === 'missing' ? { recordId: 'missing' } : {}),
        },
        'a',
        now,
      ),
    ).rejects.toThrow();
    expect(f.tx.create).not.toHaveBeenCalled();
    expect(f.tx.update).not.toHaveBeenCalled();
  }
});
