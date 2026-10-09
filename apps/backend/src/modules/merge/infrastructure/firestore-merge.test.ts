import { it, expect } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreMergeRepository } from './firestore-merge.js';
import { mergeInput } from '../domain/merge.js';
const now = Date.parse('2026-10-09T18:00:00Z');
const input = mergeInput.parse({
  sourceRecordId: 'source',
  targetRecordId: 'target',
  requestId: 'merge-1',
  reason: 'Unir atividade contínua',
});
interface Ref {
  path: string;
  id: string;
  collection(n: string): { doc(id: string): Ref };
}
function fixture() {
  const data = new Map<string, Record<string, unknown>>();
  const source: Record<string, unknown> = {
    uid: 'alice',
    projectId: 'p',
    startedAt: '2026-10-09T12:00:00Z',
    endedAt: '2026-10-09T13:00:00Z',
    timeZone: 'UTC',
    originalText: 'Evidence',
    interpretation: 'Context',
    requestId: 'original',
    fingerprint: 'kept',
    topics: [],
  };
  data.set('users/alice/records/source', source);
  data.set('users/alice/records/target', {
    ...source,
    startedAt: source.endedAt,
    endedAt: '2026-10-09T14:00:00Z',
    originalText: 'Second',
  });
  data.set('projects/p', { type: 'personal', createdBy: 'alice' });
  const ref = (path: string): Ref => ({
    path,
    id: path.split('/').at(-1)!,
    collection: (n) => collection(path + '/' + n),
  });
  const collection = (path: string) => ({
    doc: (id: string) => ref(path + '/' + id),
  });
  let writes = 0,
    fail = false;
  const db = {
    collection,
    runTransaction: async (work: (t: unknown) => Promise<unknown>) => {
      const pending: (() => void)[] = [];
      const tx = {
        get: (r: Ref) =>
          Promise.resolve({
            exists: data.has(r.path),
            id: r.id,
            updateTime: { toMillis: () => 1, nanoseconds: 1 },
            data: () => data.get(r.path),
          }),
        set: (r: Ref, v: Record<string, unknown>) =>
          pending.push(() =>
            data.set(r.path, { ...data.get(r.path), ...structuredClone(v) }),
          ),
        create: (r: Ref, v: Record<string, unknown>) => {
          if (data.has(r.path)) throw Error('collision');
          pending.push(() => data.set(r.path, structuredClone(v)));
        },
      };
      const result = await work(tx);
      if (fail && pending.length) throw Error('injected rollback');
      pending.forEach((f) => {
        f();
        writes++;
      });
      return result;
    },
  } as unknown as Firestore;
  return {
    data,
    db,
    source,
    repo: new FirestoreMergeRepository(db),
    writes: () => writes,
    fail: () => {
      fail = true;
    },
  };
}
it('previews without writes, merges atomically preserving evidence/hours and replays without writes', async () => {
  const f = fixture(),
    before = structuredClone(f.source);
  const p = await f.repo.mergeRecords(input, 'alice', now);
  expect(f.writes()).toBe(0);
  expect(p.totalMilliseconds).toBe(7200000);
  expect(p.target.originalText).toBe('Evidence\n\nSecond');
  const confirm = { ...input, confirmed: true, previewToken: p.previewToken };
  const result = await f.repo.mergeRecords(confirm, 'alice', now);
  expect(f.writes()).toBe(3);
  expect(result.source.deletedAt).toBeTruthy();
  expect(result.target.startedAt).toBe(before.startedAt);
  expect(
    f.data.get('users/alice/recordMergeAudits/' + result.operationId)?.before,
  ).toMatchObject({ source: before });
  expect(await f.repo.mergeRecords(confirm, 'alice', now + 1000)).toEqual(
    result,
  );
  expect(f.writes()).toBe(3);
  await expect(
    f.repo.mergeRecords({ ...confirm, reason: 'Outra intenção' }, 'alice', now),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
});
it('preserves chronological order when destination is first', async () => {
  const f = fixture();
  const target = f.data.get('users/alice/records/target')!;
  f.data.set('users/alice/records/source', target);
  f.data.set('users/alice/records/target', f.source);
  const p = await f.repo.mergeRecords(input, 'alice', now);
  expect(p.target.originalText).toBe('Evidence\n\nSecond');
});
it.each([
  { endedAt: null },
  { endedAt: '2026-10-09T12:30:00Z' },
  { endedAt: '2026-10-09T13:30:00Z' },
  { deletedAt: 'removed' },
  { projectId: 'other' },
  { timeZone: 'America/Sao_Paulo' },
  { interruptions: [{ description: 'pause', durationMinutes: 10 }] },
  { topics: [{ topicId: 'general', durationMinutes: 30 }] },
  { uid: 'bob' },
  { originalText: 'x'.repeat(12000) },
  { interpretation: 'x'.repeat(6000) },
])('rejects unsafe records without writes (%j)', async (change) => {
  const f = fixture();
  Object.assign(f.source, change);
  f.data.set('projects/other', { type: 'work' });
  await expect(f.repo.mergeRecords(input, 'alice', now)).rejects.toBeTruthy();
  expect(f.writes()).toBe(0);
});
it('rejects matching absolute-minute allocations', async () => {
  const f = fixture();
  f.source.topics = [{ topicId: 'general', durationMinutes: 30 }];
  f.data.get('users/alice/records/target')!.topics = f.source.topics;
  await expect(f.repo.mergeRecords(input, 'alice', now)).rejects.toMatchObject({
    code: 'failed-precondition',
  });
});
it('rejects stale token, missing confirmation token and injected UID', async () => {
  const f = fixture();
  const p = await f.repo.mergeRecords(input, 'alice', now);
  f.source.originalText = 'Changed';
  await expect(
    f.repo.mergeRecords(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
      now,
    ),
  ).rejects.toMatchObject({ code: 'aborted' });
  expect(mergeInput.safeParse({ ...input, confirmed: true }).success).toBe(
    false,
  );
  expect(mergeInput.safeParse({ ...input, uid: 'bob' }).success).toBe(false);
  expect(
    mergeInput.safeParse({ ...input, sourceRecordId: 'target' }).success,
  ).toBe(false);
  expect(f.writes()).toBe(0);
});
it('rechecks private ownership on preview, confirmation and replay', async () => {
  const f = fixture();
  const p = await f.repo.mergeRecords(input, 'alice', now);
  const confirm = { ...input, confirmed: true, previewToken: p.previewToken };
  await f.repo.mergeRecords(confirm, 'alice', now);
  f.data.set('projects/p', { type: 'personal', createdBy: 'bob' });
  await expect(
    f.repo.mergeRecords(confirm, 'alice', now),
  ).rejects.toMatchObject({ code: 'not-found' });
});
it('rolls back all writes on transaction failure', async () => {
  const f = fixture(),
    before = structuredClone([...f.data]);
  const p = await f.repo.mergeRecords(input, 'alice', now);
  f.fail();
  await expect(
    f.repo.mergeRecords(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
      now,
    ),
  ).rejects.toThrow('injected rollback');
  expect([...f.data]).toEqual(before);
  expect(f.writes()).toBe(0);
});
