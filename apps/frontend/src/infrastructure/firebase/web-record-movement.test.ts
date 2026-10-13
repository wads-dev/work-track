import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const state = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
  trace: vi.fn(),
  write: vi.fn(),
  failCommit: false,
}));
vi.mock('../../data/sync/firestore-diagnostics', () => ({
  traceFirestore: state.trace,
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  runTransaction: async (
    _db: unknown,
    run: (tx: unknown) => Promise<unknown>,
  ) => {
    const pending: Array<{
      path: string;
      data: Record<string, unknown>;
      merge: boolean;
    }> = [];
    const tx = {
      get: async (ref: { path: string }) => {
        state.reads.push(ref.path);
        return {
          exists: () => state.data.has(ref.path),
          data: () => state.data.get(ref.path),
        };
      },
      update: (ref: { path: string }, data: Record<string, unknown>) => {
        state.write(ref, data);
        pending.push({ path: ref.path, data, merge: true });
        return tx;
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        state.write(ref, data);
        pending.push({ path: ref.path, data, merge: false });
        return tx;
      },
    };
    const result = await run(tx);
    if (state.failCommit) throw new Error('permission-denied');
    for (const write of pending)
      state.data.set(write.path, {
        ...(write.merge ? state.data.get(write.path) : {}),
        ...write.data,
      });
    return result;
  },
}));
import { WebRecordMovementRepository } from './web-record-movement';
import { hash } from './web-transaction-adapter';
const repo = new WebRecordMovementRepository({} as Firestore);
const input = {
  recordId: 'record',
  project_target: 'target',
  requestId: 'move',
  reason: 'Private reason',
  confirmed: false,
};
const recordPath = 'users/actor/records/record';
const auditPath =
  recordPath + '/audit/movement_' + hash(['actor', 'move_record', 'move']);
beforeEach(() => {
  state.data.clear();
  state.reads.length = 0;
  state.trace.mockReset();
  state.write.mockReset();
  state.failCommit = false;
  const topic = {
    id: 'topic',
    title: 'Private topic',
    description: 'Private context',
  };
  state.data.set('projects/source', { type: 'work', topics: [topic] });
  state.data.set('projects/target', {
    type: 'work',
    title: 'Private title',
    description: 'Private description',
    topics: [topic],
  });
  state.data.set(recordPath, {
    uid: 'actor',
    projectId: 'source',
    originalText: 'Private original text',
    topics: [{ topicId: 'topic' }],
  });
});

function commitEvents() {
  return state.trace.mock.calls.filter(
    ([event]) => event === 'transaction.commit',
  );
}
const commit = (count: number) => [
  'transaction.commit',
  {
    operation: 'web-record-movement.move-record',
    count,
    source: 'remote-confirmed',
  },
];

it.each([false, true])(
  'counts the moved record, receipt and optional new topic (create: %s), not replay',
  async (create) => {
    if (create)
      state.data.set('projects/target', {
        ...state.data.get('projects/target'),
        topics: [],
      });
    const preview = await repo.moveRecord(input, 'actor');
    expect(commitEvents()).toEqual([commit(0)]);
    const command = {
      ...input,
      confirmed: true,
      previewToken: String(preview.previewToken),
    };
    state.trace.mockClear();
    const result = await repo.moveRecord(command, 'actor');
    expect(result).toMatchObject({
      mode: 'execution',
      project_target: 'target',
    });
    expect(state.write.mock.calls.map(([ref]) => ref.path)).toEqual([
      ...(create ? ['projects/target'] : []),
      recordPath,
      auditPath,
    ]);
    expect(state.data.get(recordPath)).toMatchObject({
      projectId: 'target',
      originalText: 'Private original text',
    });
    expect(commitEvents()).toEqual([commit(create ? 3 : 2)]);
    state.trace.mockClear();
    expect(await repo.moveRecord(command, 'actor')).toEqual(result);
    expect(state.write).toHaveBeenCalledTimes(create ? 3 : 2);
    expect(commitEvents()).toEqual([commit(0)]);
  },
);

it('does not log a commit when the native movement transaction rejects', async () => {
  const preview = await repo.moveRecord(input, 'actor');
  state.trace.mockClear();
  state.failCommit = true;
  await expect(
    repo.moveRecord(
      { ...input, confirmed: true, previewToken: String(preview.previewToken) },
      'actor',
    ),
  ).rejects.toThrow('permission-denied');
  expect(state.write).toHaveBeenCalledTimes(2);
  expect(state.data.get(recordPath)?.projectId).toBe('source');
  expect(state.data.has(auditPath)).toBe(false);
  expect(commitEvents()).toEqual([]);
});

it('does not log a commit or writes for a stale movement confirmation', async () => {
  await expect(
    repo.moveRecord(
      { ...input, confirmed: true, previewToken: '0'.repeat(64) },
      'actor',
    ),
  ).rejects.toThrow('Prévia desatualizada');
  expect(state.write).not.toHaveBeenCalled();
  expect(commitEvents()).toEqual([]);
});

it.each([true, false])(
  'traces movement reads in their original parallel batches with record existence %s',
  async (exists) => {
    if (!exists) state.data.delete(recordPath);
    const result = repo.moveRecord(input, 'actor');
    if (exists) expect(await result).toMatchObject({ mode: 'preview' });
    else
      await expect(result).rejects.toThrow(
        'Registro autorizado ativo não encontrado',
      );
    const record = {
      operation: 'web-record-movement.move-record',
      collection: 'users/actor/records',
      path: recordPath,
      source: 'remote-transaction',
    };
    const audit = {
      ...record,
      collection: recordPath + '/audit',
      path: auditPath,
    };
    const source = {
      ...record,
      collection: 'projects',
      path: 'projects/source',
    };
    const target = { ...source, path: 'projects/target' };
    expect(state.reads).toEqual([
      recordPath,
      auditPath,
      ...(exists ? ['projects/source', 'projects/target'] : []),
    ]);
    expect(state.trace.mock.calls).toEqual([
      ['transaction.read', record],
      ['transaction.read', audit],
      ['transaction.result', { ...record, count: exists ? 1 : 0 }],
      ['transaction.result', { ...audit, count: 0 }],
      ...(exists
        ? [
            ['transaction.read', source],
            ['transaction.read', target],
            ['transaction.result', { ...source, count: 1 }],
            ['transaction.result', { ...target, count: 1 }],
          ]
        : []),
      ...(exists
        ? [
            [
              'transaction.commit',
              {
                operation: record.operation,
                count: 0,
                source: 'remote-confirmed',
              },
            ],
          ]
        : []),
    ]);
    expect(state.write).not.toHaveBeenCalled();
  },
);
