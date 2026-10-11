import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const state = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  writes: [] as unknown[],
  queries: vi.fn(),
}));
vi.mock('firebase/firestore', () => {
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) });
  const make = (base: { path?: string }, ...parts: string[]) =>
    ref([base.path, ...parts].filter(Boolean).join('/'));
  const snapshot = (r: { path: string }) => ({
    ...r,
    ref: r,
    exists: () => state.data.has(r.path),
    data: () => state.data.get(r.path),
  });
  return {
    doc: make,
    collection: make,
    documentId: () => '__name__',
    query: (r: unknown, ...c: unknown[]) => ({ r, c }),
    limit: (n: number) => ({ limit: n }),
    orderBy: (s: string) => ({ order: s }),
    startAfter: (s: unknown) => ({ after: s }),
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    deleteField: () => 'DELETE_FIELD',
    getDocFromServer: async (r: { path: string }) => snapshot(r),
    getDocsFromServer: state.queries,
    runTransaction: async (
      _db: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => {
      const pending: Array<{
        path: string;
        data: Record<string, unknown>;
        merge: boolean;
      }> = [];
      const result = await fn({
        get: async (r: { path: string }) => snapshot(r),
        update: (r: { path: string }, data: Record<string, unknown>) =>
          pending.push({ path: r.path, data, merge: true }),
        set: (r: { path: string }, data: Record<string, unknown>) =>
          pending.push({ path: r.path, data, merge: false }),
      });
      for (const w of pending) {
        state.data.set(w.path, {
          ...(w.merge ? state.data.get(w.path) : {}),
          ...w.data,
        });
        state.writes.push(w);
      }
      return result;
    },
  };
});
import { WebWorkRepository } from './web-work-repository';
const repo = new WebWorkRepository({} as Firestore);
const project = {
  title: 'Projeto',
  description: 'Descrição generosa suficiente para validar metadados.',
  createdBy: 'alice',
  topics: [{ id: 'general', title: 'Geral', description: 'Contexto geral' }],
};
const record = {
  uid: 'alice',
  projectId: 'p',
  startedAt: '2026-10-10T09:00:00-03:00',
  endedAt: null,
  topics: [{ topicId: 'general' }],
  originalText: 'comecei',
  interpretation: 'Atividade geral',
  timezone: 'America/Sao_Paulo',
};
beforeEach(() => {
  state.data.clear();
  state.writes.length = 0;
  state.queries.mockReset();
  state.data.set('projects/p', project);
  state.data.set('users/alice/records/r', record);
});
it('allows authenticated noncreator work/legacy writes and atomic actor audit, retries same intent', async () => {
  const input = {
    projectId: 'p',
    requestId: 'req',
    reason: 'Atualizar nome',
    title: 'Novo título',
  };
  const result = await repo.updateProject(input, 'bob');
  expect(state.data.get('projects/p')?.title).toBe('Novo título');
  expect(state.data.get('projects/p/audit/req')?.authorUid).toBe('bob');
  expect(state.writes).toHaveLength(2);
  expect(await repo.updateProject(input, 'bob')).toEqual(result);
  expect(state.writes).toHaveLength(2);
  await expect(
    repo.updateProject({ ...input, title: 'Outra intenção' }, 'bob'),
  ).rejects.toThrow('requestId');
});
it('persists optional project color and clears it with an audited update', async () => {
  await repo.updateProject(
    { projectId: 'p', requestId: 'color1', reason: 'Cor', color: '#dc2626' },
    'bob',
  );
  expect(state.data.get('projects/p')?.color).toBe('#dc2626');
  await repo.updateProject(
    { projectId: 'p', requestId: 'color2', reason: 'Automática', color: null },
    'bob',
  );
  expect(state.data.get('projects/p')?.color).toBeNull();
  expect(state.data.get('projects/p/audit/color2')?.authorUid).toBe('bob');
});

it('denies foreign personal project access without writes', async () => {
  state.data.set('projects/p', { ...project, type: 'personal' });
  await expect(
    repo.archiveProject(
      { projectId: 'p', archived: true, requestId: 'req', reason: 'Arquivar' },
      'bob',
    ),
  ).rejects.toThrow();
  expect(state.writes).toHaveLength(0);
});
it('rejects merged reopens, locked updates, and implicit scope changes', async () => {
  state.data.set('projects/p', {
    ...project,
    mergedInto: 'other',
    archived: true,
  });
  await expect(
    repo.archiveProject(
      { projectId: 'p', archived: false, requestId: 'req', reason: 'Reabrir' },
      'alice',
    ),
  ).rejects.toThrow();
  state.data.set('projects/p', { ...project, mergeLock: 'job' });
  await expect(
    repo.updateProject(
      { projectId: 'p', title: 'Novo', requestId: 'req', reason: 'Editar' },
      'alice',
    ),
  ).rejects.toThrow();
  state.data.set('projects/p', project);
  await expect(
    repo.updateProject(
      { projectId: 'p', type: 'personal', requestId: 'req', reason: 'Privado' },
      'alice',
    ),
  ).rejects.toThrow('escopo');
  expect(state.writes).toHaveLength(0);
});
it('preserves expectedUpdatedAt conflict and own record authority', async () => {
  await expect(
    repo.updateRecord(
      {
        recordId: 'r',
        endedAt: '2026-10-10T10:00:00-03:00',
        expectedUpdatedAt: 'stale',
        reason: 'Encerrar',
      },
      'alice',
    ),
  ).rejects.toThrow('Registro alterado');
  state.data.set('users/alice/records/r', { ...record, uid: 'bob' });
  await expect(
    repo.updateRecord(
      { recordId: 'r', endedAt: null, reason: 'Reabrir' },
      'alice',
    ),
  ).rejects.toThrow('próprio');
  expect(state.writes).toHaveLength(0);
});
it('edits record end atomically preserving all original evidence and replay without extra audit', async () => {
  state.data.set('users/alice/records/r', {
    ...record,
    timeZone: 'America/Sao_Paulo',
    requestId: 'original',
  });
  const input = {
    recordId: 'r',
    endedAt: '2026-10-10T10:00:00-03:00',
    requestId: 'edit',
    reason: 'Encerrar',
  };
  const result = await repo.updateRecord(input, 'alice');
  expect(state.data.get('users/alice/records/r')).toMatchObject({
    originalText: record.originalText,
    interpretation: record.interpretation,
    uid: 'alice',
    endedAt: input.endedAt,
  });
  expect(state.writes).toHaveLength(2);
  expect(await repo.updateRecord(input, 'alice')).toEqual(result);
  expect(state.writes).toHaveLength(2);
});
it('rejects cursor outside project and paginates without partial silent history', async () => {
  await expect(
    repo.listTopicMerges(
      { projectId: 'p', limit: 1, cursor: 'foreign' },
      'alice',
    ),
  ).rejects.toThrow('Cursor');
  expect(state.queries).not.toHaveBeenCalled();
  state.queries.mockResolvedValue({
    size: 2,
    docs: [
      { id: 'a', data: () => ({ projectId: 'p', before: [], after: [] }) },
      { id: 'b', data: () => ({ projectId: 'p' }) },
    ],
  });
  expect(
    await repo.listTopicMerges({ projectId: 'p', limit: 1 }, 'alice'),
  ).toMatchObject({ items: [{ id: 'a' }], nextCursor: 'a' });
});
