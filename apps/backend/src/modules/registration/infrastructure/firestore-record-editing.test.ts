import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreRecordEditingRepository } from './firestore-record-editing.js';
it('atomically audits edits, preserves immutable fields, and replays the same request once', async () => {
  const values = new Map<string, Record<string, unknown>>();
  const recordPath = 'users/alice/records/record';
  values.set(recordPath, {
    id: 'record',
    uid: 'alice',
    projectId: 'project',
    startedAt: '2026-10-08T10:00:00Z',
    timeZone: 'UTC',
    originalText: 'original evidence',
    interpretation: 'context',
    requestId: 'original-intent',
    fingerprint: 'original-fingerprint',
    recordedAt: 'original-time',
    topics: [{ topicId: 'general' }],
  });
  values.set('projects/project', {
    title: 'Project',
    description: 'Description of project',
    topics: [{ id: 'general', title: 'Geral', description: 'General work' }],
  });
  interface Ref {
    path: string;
    id: string;
    collection: (name: string) => { doc: (id?: string) => Ref };
  }
  const ref = (path: string): Ref => ({
    path,
    id: path.split('/').at(-1)!,
    collection: (name) => ({
      doc: (id = 'generated') => ref(path + '/' + name + '/' + id),
    }),
  });
  let updates = 0,
    audits = 0;
  const tx = {
    get: (r: Ref) =>
      Promise.resolve({
        exists: values.has(r.path),
        data: () => values.get(r.path),
      }),
    update: (r: Ref, patch: Record<string, unknown>) => {
      updates++;
      values.set(r.path, { ...values.get(r.path), ...patch });
    },
    create: (r: Ref, data: Record<string, unknown>) => {
      audits++;
      values.set(r.path, data);
    },
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(name + '/' + id),
    }),
    runTransaction: (work: (transaction: typeof tx) => Promise<unknown>) =>
      work(tx),
  } as unknown as Firestore;
  const repo = new FirestoreRecordEditingRepository(db);
  const input = {
    recordId: 'record',
    endedAt: '2026-10-08T11:00:00Z',
    reason: 'Confirmed finish',
    requestId: 'edit-one',
    expectedUpdatedAt: null,
  };
  const result = await repo.updateRecord(input, 'alice');
  expect(values.get(recordPath)).toMatchObject({
    endedAt: input.endedAt,
    originalText: 'original evidence',
    requestId: 'original-intent',
    fingerprint: 'original-fingerprint',
    recordedAt: 'original-time',
  });
  const audit = values.get(recordPath + '/audit/edit-one');
  expect(audit).toMatchObject({
    authorUid: 'alice',
    reason: 'Confirmed finish',
    before: { startedAt: '2026-10-08T10:00:00Z' },
    after: { endedAt: input.endedAt },
  });
  expect(audit?.before).not.toHaveProperty('originalText');
  expect(audit?.after).not.toHaveProperty('originalText');
  await expect(repo.updateRecord(input, 'alice')).resolves.toEqual(result);
  expect(updates).toBe(1);
  expect(audits).toBe(1);
  await expect(
    repo.updateRecord({ ...input, endedAt: '2026-10-08T12:00:00Z' }, 'alice'),
  ).rejects.toThrow('requestId');
  await expect(
    repo.updateRecord({ ...input, requestId: 'edit-two' }, 'alice'),
  ).rejects.toThrow('Recarregue');
  expect(updates).toBe(1);
  expect(audits).toBe(1);
  const reopened = await repo.updateRecord(
    {
      recordId: 'record',
      endedAt: null,
      reason: 'Explicit reopening',
      requestId: 'reopen',
    },
    'alice',
  );
  expect(values.get(recordPath)?.endedAt).toBeNull();
  expect(reopened.record).not.toHaveProperty('endedAt');
  await repo.updateRecord(
    {
      recordId: 'record',
      topics: [{ topicId: 'general' }],
      reason: 'Edit nullable open record',
      requestId: 'open-edit',
    },
    'alice',
  );
  expect(values.get(recordPath)).toMatchObject({
    endedAt: null,
    originalText: 'original evidence',
    recordedAt: 'original-time',
  });
});

it('lists nullable and legacy open records but not closed or deleted records', async () => {
  const rows = [
    { id: 'legacy' },
    { id: 'nullable', endedAt: null },
    { id: 'closed', endedAt: '2026-10-08T11:00:00Z' },
    { id: 'deleted', endedAt: null, deletedAt: '2026-10-08T11:00:00Z' },
  ];
  const collection = {
    get: () =>
      Promise.resolve({
        docs: rows.map((row) => ({
          id: row.id,
          data: () => ({
            projectId: 'p',
            startedAt: '2026-10-08T10:00:00Z',
            ...row,
          }),
        })),
      }),
  };
  const db = {
    collection: () => ({ doc: () => ({ collection: () => collection }) }),
  } as unknown as Firestore;
  const repo = new FirestoreRecordEditingRepository(db);
  expect(
    (await repo.listOpenRecords('alice', 10)).records.map((r) => r.id),
  ).toEqual(['legacy', 'nullable']);
  expect((await repo.listOpenRecords('alice', 1)).partial).toBe(true);
});
