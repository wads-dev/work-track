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
  state.data.set('projects/source', {
    type: 'work',
    createdBy: 'actor',
    title: 'Private title',
  });
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
    ]);
    expect(state.write).not.toHaveBeenCalled();
  },
);
