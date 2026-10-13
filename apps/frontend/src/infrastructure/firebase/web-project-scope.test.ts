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
import { WebProjectScopeRepository } from './web-project-scope';
import { hash } from './web-transaction-adapter';
const repo = new WebProjectScopeRepository({} as Firestore);
const input = {
  projectId: 'source',
  type: 'personal' as const,
  requestId: 'scope',
  reason: 'Private reason',
  confirmed: false,
  acknowledgeSharedDestination: false,
};
const auditPath =
  'projects/source/audit/scope_' + hash(['actor', 'scope', 'scope']);
beforeEach(() => {
  state.data.clear();
  state.reads.length = 0;
  state.trace.mockReset();
  state.write.mockReset();
  state.failCommit = false;
  state.data.set('projects/source', {
    type: 'work',
    createdBy: 'actor',
    title: 'Private title',
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
    operation: 'web-project-scope.change-scope',
    count,
    source: 'remote-confirmed',
  },
];

it('counts the scope update and receipt once and confirms replay with zero writes', async () => {
  const preview = await repo.changeScope(input, 'actor');
  expect(commitEvents()).toEqual([commit(0)]);
  const command = {
    ...input,
    confirmed: true,
    previewToken: 'previewToken' in preview ? preview.previewToken : '',
  };
  state.trace.mockClear();
  const result = await repo.changeScope(command, 'actor');
  expect(result).toMatchObject({ mode: 'execution', type: 'personal' });
  expect(state.write).toHaveBeenCalledTimes(2);
  expect(state.data.get('projects/source')?.type).toBe('personal');
  expect(commitEvents()).toEqual([commit(2)]);
  state.trace.mockClear();
  expect(await repo.changeScope(command, 'actor')).toEqual(result);
  expect(state.write).toHaveBeenCalledTimes(2);
  expect(commitEvents()).toEqual([commit(0)]);
});

it('does not log a commit when the native scope transaction rejects', async () => {
  const preview = await repo.changeScope(input, 'actor');
  state.trace.mockClear();
  state.failCommit = true;
  await expect(
    repo.changeScope(
      {
        ...input,
        confirmed: true,
        previewToken: 'previewToken' in preview ? preview.previewToken : '',
      },
      'actor',
    ),
  ).rejects.toThrow('permission-denied');
  expect(state.write).toHaveBeenCalledTimes(2);
  expect(state.data.get('projects/source')?.type).toBe('work');
  expect(state.data.has(auditPath)).toBe(false);
  expect(commitEvents()).toEqual([]);
});

it('does not log a commit or writes for a stale scope confirmation', async () => {
  await expect(
    repo.changeScope(
      { ...input, confirmed: true, previewToken: '0'.repeat(64) },
      'actor',
    ),
  ).rejects.toThrow('Prévia desatualizada');
  expect(state.write).not.toHaveBeenCalled();
  expect(commitEvents()).toEqual([]);
});

it.each([true, false])(
  'traces only parallel scope document/audit reads with project existence %s',
  async (exists) => {
    if (!exists) state.data.delete('projects/source');
    const result = repo.changeScope(input, 'actor');
    if (exists) expect(await result).toMatchObject({ mode: 'preview' });
    else await expect(result).rejects.toThrow('Projeto não encontrado');
    const project = {
      operation: 'web-project-scope.change-scope',
      collection: 'projects',
      path: 'projects/source',
      source: 'remote-transaction',
    };
    const audit = {
      ...project,
      collection: 'projects/source/audit',
      path: auditPath,
    };
    expect(state.reads).toEqual(['projects/source', auditPath]);
    expect(state.trace.mock.calls).toEqual([
      ['transaction.read', project],
      ['transaction.read', audit],
      ['transaction.result', { ...project, count: exists ? 1 : 0 }],
      ['transaction.result', { ...audit, count: 0 }],
      ...(exists
        ? [
            [
              'transaction.commit',
              {
                operation: project.operation,
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
