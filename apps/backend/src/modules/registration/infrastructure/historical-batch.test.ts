import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreHistoricalRecordsRepository } from './firestore-historical-records.js';
import { updateRecordTopicsBatchInput } from '../presentation/historical-record-tools.js';
import { preserveTopicDistributions } from './topic-distributions.js';
function fixture() {
  const before = {
    uid: 'u',
    projectId: 'p',
    topics: [{ topicId: 'general' }],
    startedAt: '2026-06-01T00:00:00Z',
    endedAt: null,
    originalText: 'evidence',
    interpretation: 'text',
    interruptions: [],
  };
  const project = {
    type: 'work',
    topics: [{ id: 'general' }, { id: 'clear' }],
  };
  const audit: Record<string, unknown> = {};
  const ref = (path: string): unknown => ({
    path,
    doc: (id: string) => ref(path + '/' + id),
    collection: (id: string) => ref(path + '/' + id),
  });
  const tx = {
    get: vi.fn((r: { path: string }) =>
      Promise.resolve({
        id: 'r',
        data: () =>
          r.path.includes('/audit/')
            ? audit.value
            : r.path === 'projects/p'
              ? project
              : before,
        updateTime: {
          toMillis: () => 0,
          nanoseconds: 0,
          toDate: () => new Date(0),
        },
      }),
    ),
    update: vi.fn(),
    create: vi.fn((_r: unknown, value: unknown) => {
      audit.value = value;
    }),
  };
  const db = {
    collection: (p: string) => ref(p),
    runTransaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as Firestore;
  const input = updateRecordTopicsBatchInput.parse({
    requestId: 'batch',
    records: [
      {
        recordId: 'r',
        topicIds: ['clear'],
        expectedVersion: '0:0',
        reason: 'clear evidence',
      },
    ],
  });
  return {
    repo: new FirestoreHistoricalRecordsRepository(db),
    input,
    tx,
    before,
    project,
  };
}
it('rejects duplicate records after resolving default owner', async () => {
  const { repo, input, tx } = fixture();
  await expect(
    repo.updateRecordTopicsBatch(
      {
        ...input,
        records: [
          input.records[0]!,
          { ...input.records[0]!, recordOwnerUid: 'u' },
        ],
      },
      'u',
    ),
  ).rejects.toThrow('duplicados');
  expect(tx.update).not.toHaveBeenCalled();
});
it('previews without writes then applies only topic metadata and audits once', async () => {
  const { repo, input, tx, before } = fixture();
  expect(
    (await repo.updateRecordTopicsBatch(input, 'u')).results[0]?.status,
  ).toBe('preview');
  expect(tx.update).not.toHaveBeenCalled();
  expect(tx.create).not.toHaveBeenCalled();
  const applied = await repo.updateRecordTopicsBatch(
    { ...input, confirmed: true },
    'u',
  );
  expect(applied.results[0]?.status).toBe('updated');
  expect(Object.keys(tx.update.mock.calls[0]![1] as object).sort()).toEqual(
    ['topics', 'topicSnapshots', 'updatedAt', 'updatedBy'].sort(),
  );
  expect(before.originalText).toBe('evidence');
  expect(
    (await repo.updateRecordTopicsBatch({ ...input, confirmed: true }, 'u'))
      .results[0]?.status,
  ).toBe('replayed');
  expect(tx.update).toHaveBeenCalledTimes(1);
});
it('rejects conflicts, unauthorized projects and reused request content individually', async () => {
  const { repo, input, tx, project } = fixture();
  expect(
    (
      await repo.updateRecordTopicsBatch(
        {
          ...input,
          records: [{ ...input.records[0]!, expectedVersion: 'stale' }],
        },
        'u',
      )
    ).results[0]?.status,
  ).toBe('rejected');
  expect(tx.update).not.toHaveBeenCalled();
  await repo.updateRecordTopicsBatch({ ...input, confirmed: true }, 'u');
  expect(
    (
      await repo.updateRecordTopicsBatch(
        {
          ...input,
          confirmed: true,
          records: [{ ...input.records[0]!, reason: 'different' }],
        },
        'u',
      )
    ).results[0]?.status,
  ).toBe('rejected');
  project.type = 'invalid';
  expect(
    (await repo.updateRecordTopicsBatch(input, 'u')).results[0]?.status,
  ).toBe('rejected');
});
it('rejects distributed remaps, missing topics and unsafe batch fields', () => {
  expect(() =>
    preserveTopicDistributions(
      [{ topicId: 'general', percentage: 100 }],
      ['clear'],
      [{ id: 'clear' }],
    ),
  ).toThrow('Distribuição');
  expect(() =>
    preserveTopicDistributions([{ topicId: 'general' }], ['missing'], []),
  ).toThrow('Tópico');
  expect(
    updateRecordTopicsBatchInput.safeParse({
      requestId: 'x',
      records: [
        {
          recordId: 'r',
          topicIds: ['x'],
          expectedVersion: '0',
          reason: 'r',
          startedAt: 'changed',
        },
      ],
    }).success,
  ).toBe(false);
});
