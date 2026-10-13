import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const state = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
  trace: vi.fn(),
  write: vi.fn(),
}));
vi.mock('../../data/sync/firestore-diagnostics', () => ({
  traceFirestore: state.trace,
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  runTransaction: (_db: unknown, run: (tx: unknown) => Promise<unknown>) =>
    run({
      get: async (ref: { path: string }) => {
        state.reads.push(ref.path);
        return {
          exists: () => state.data.has(ref.path),
          data: () => state.data.get(ref.path),
        };
      },
      update: state.write,
      set: state.write,
    }),
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
    ]);
    expect(state.write).not.toHaveBeenCalled();
  },
);
