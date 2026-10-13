import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import { createHash } from 'node:crypto';
import { normalize } from '@work-track/core/shared/text/normalize';
const trace = vi.hoisted(() => vi.fn());
vi.mock('../../data/sync/firestore-diagnostics', () => ({
  traceFirestore: trace,
}));
const state = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  writes: [] as unknown[],
  reads: [] as string[],
  failCommit: false,
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
        get: async (r: { path: string }) => {
          state.reads.push(r.path);
          return snapshot(r);
        },
        update: (r: { path: string }, data: Record<string, unknown>) =>
          pending.push({ path: r.path, data, merge: true }),
        set: (r: { path: string }, data: Record<string, unknown>) =>
          pending.push({ path: r.path, data, merge: false }),
      });
      if (state.failCommit) throw new Error('permission-denied');
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
  requestId: 'original',
  projectId: 'p',
  startedAt: '2026-10-10T09:00:00-03:00',
  endedAt: null,
  topics: [{ topicId: 'general' }],
  originalText: 'comecei',
  interpretation: 'Atividade geral',
  timeZone: 'America/Sao_Paulo',
};
beforeEach(() => {
  trace.mockReset();
  state.data.clear();
  state.writes.length = 0;
  state.reads.length = 0;
  state.failCommit = false;
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
  expect(
    trace.mock.calls.filter(([event]) => event === 'transaction.commit'),
  ).toEqual([
    [
      'transaction.commit',
      {
        operation: 'web-work.update-project',
        count: 2,
        source: 'remote-confirmed',
      },
    ],
    [
      'transaction.commit',
      {
        operation: 'web-work.update-project',
        count: 0,
        source: 'remote-confirmed',
      },
    ],
  ]);
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
  expect(
    trace.mock.calls.filter(([event]) => event === 'transaction.commit'),
  ).toEqual([
    [
      'transaction.commit',
      {
        operation: 'web-work.update-record',
        count: 2,
        source: 'remote-confirmed',
      },
    ],
    [
      'transaction.commit',
      {
        operation: 'web-work.update-record',
        count: 0,
        source: 'remote-confirmed',
      },
    ],
  ]);
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
it('requires explicit personal publication acknowledgement and atomically audits project topics context and reopening', async () => {
  state.data.set('projects/p', { ...project, type: 'personal' });
  state.data.set('projects/q', {
    ...project,
    title: 'Destino',
    type: 'work',
    topics: [
      { id: 'target', title: 'Destino', description: 'Tópico de destino' },
    ],
  });
  const input = {
    recordId: 'r',
    projectId: 'q',
    topics: [{ topicId: 'target' }],
    endedAt: null,
    interpretation: 'Novo contexto',
    requestId: 'edit-project',
    expectedUpdatedAt: null,
    reason: 'Edição de registro pela interface web.',
  };
  await expect(repo.updateRecord(input, 'alice')).rejects.toThrow(
    'Autorize compartilhar',
  );
  expect(state.writes).toHaveLength(0);
  const command = { ...input, acknowledgeSharedDestination: true };
  const result = await repo.updateRecord(command, 'alice');
  const after = state.data.get('users/alice/records/r')!;
  expect(after.projectId).toBe('q');
  expect(after.topics).toEqual([{ topicId: 'target' }]);
  expect(after.endedAt).toBeNull();
  expect(after.originalText).toBe('comecei');
  const audit = state.data.get('users/alice/records/r/audit/edit-project')!;
  expect(audit.authorUid).toBe('alice');
  expect(audit.before).toEqual(record);
  expect(audit.after).toMatchObject({
    projectId: 'q',
    interpretation: 'Novo contexto',
    endedAt: null,
  });
  expect(audit.updatedAt).toBe(result.updatedAt);
  expect(await repo.updateRecord(command, 'alice')).toEqual(result);
  expect(state.writes).toHaveLength(2);
});

const createInput = {
  title: '  Ação: Projeto!  ',
  description: '  Descrição generosa do escopo e atividades do projeto.  ',
  type: 'work' as const,
  requestId: 'create-1',
};
const backendKey = (title: string, uid?: string) =>
  createHash('sha256')
    .update(uid ? 'personal:' + uid + ':' + normalize(title) : normalize(title))
    .digest('hex');
it('creates backend-compatible work IDs and atomically audits the current creator with default Geral', async () => {
  const result = await repo.createProject(
    { ...createInput, createdBy: 'spoof' },
    'alice',
  );
  const id = backendKey(createInput.title);
  expect(result).toEqual({
    id,
    title: createInput.title.trim(),
    description: createInput.description.trim(),
    type: 'work',
    archived: false,
    confidential: false,
    publicAlias: 'Projeto reservado',
    createdBy: 'alice',
    createdAt: expect.any(String),
    topics: [
      {
        id: 'general',
        title: 'Geral',
        description: 'Atividade geral ou tópico ainda não identificado.',
      },
    ],
  });
  expect(state.data.get('projects/' + id)).toEqual({
    ...result,
    recordedAt: 'SERVER_TIMESTAMP',
  });
  expect(state.data.get('projects/' + id + '/audit/created')).toEqual({
    authorUid: 'alice',
    action: 'create',
    after: result,
    requestId: 'create-1',
    recordedAt: 'SERVER_TIMESTAMP',
  });
  expect(state.writes).toHaveLength(2);
  expect(state.reads).toEqual(['projects/' + id]);
  expect(state.queries).not.toHaveBeenCalled();
});
it('reuses normalized global work titles across actors without overwriting metadata or audit', async () => {
  const result = await repo.createProject(createInput, 'alice');
  const before = state.data.get('projects/' + result.id)!;
  expect(
    await repo.createProject(
      {
        ...createInput,
        title: 'acao projeto',
        description: 'Outra descrição generosa que não deve sobrescrever.',
        requestId: 'another',
      },
      'bob',
    ),
  ).toEqual(before);
  expect(await repo.createProject(createInput, 'alice')).toEqual(before);
  expect(state.writes).toHaveLength(2);
  expect(
    state.data.get('projects/' + result.id + '/audit/created')?.authorUid,
  ).toBe('alice');
});
it('keeps personal uniqueness per owner separate from work using the backend raw SHA256 prefix', async () => {
  const alice = await repo.createProject(
    { ...createInput, type: 'personal' },
    'alice',
  );
  const bob = await repo.createProject(
    { ...createInput, type: 'personal' },
    'bob',
  );
  const work = await repo.createProject(createInput, 'alice');
  expect(alice.id).toBe(backendKey(createInput.title, 'alice'));
  expect(bob.id).toBe(backendKey(createInput.title, 'bob'));
  expect(new Set([alice.id, bob.id, work.id]).size).toBe(3);
  expect(
    (await repo.createProject({ ...createInput, type: 'personal' }, 'alice'))
      .id,
  ).toBe(alice.id);
  expect(state.writes).toHaveLength(6);
});
it('preserves explicit optional metadata and supports old creation APIs without requestId', async () => {
  const { requestId, ...input } = createInput;
  void requestId;
  const result = await repo.createProject(
    {
      ...input,
      confidential: true,
      publicAlias: 'Projeto reservado 2',
      color: '#dc2626',
      githubUrl: 'https://github.com/owner/repo',
    },
    'alice',
  );
  expect(result).toMatchObject({
    confidential: true,
    publicAlias: 'Projeto reservado 2',
    color: '#dc2626',
    githubUrl: 'https://github.com/owner/repo',
  });
  expect(result).not.toHaveProperty('requestId');
  expect(
    state.data.get('projects/' + result.id + '/audit/created'),
  ).not.toHaveProperty('requestId');
});
it('requires explicit valid scope, core title/description constraints, safe requestId and authentication', async () => {
  const { type, ...withoutScope } = createInput;
  void type;
  for (const input of [
    withoutScope,
    { ...createInput, type: 'invalid' },
    { ...createInput, title: 'a' },
    { ...createInput, description: 'short' },
    { ...createInput, requestId: '../bad' },
  ])
    await expect(repo.createProject(input, 'alice')).rejects.toThrow();
  await expect(repo.createProject(createInput, '')).rejects.toThrow(
    'Autenticação',
  );
  expect(state.writes).toHaveLength(0);
  expect(state.reads).toHaveLength(0);
});
it('rejects inaccessible or scope-changed projects and archived or merged reuse without mutation', async () => {
  const id = backendKey(createInput.title);
  for (const metadata of [
    { type: 'personal', createdBy: 'bob' },
    { type: 'personal', createdBy: 'alice' },
    { type: 'work', archived: true },
    { type: 'work', mergeLock: 'job' },
    { type: 'work', mergedInto: 'target' },
  ]) {
    state.data.set('projects/' + id, { ...project, id, ...metadata });
    await expect(repo.createProject(createInput, 'alice')).rejects.toThrow();
  }
  expect(state.writes).toHaveLength(0);
});
it('reuses readable legacy work projects without changing their scope or evidence', async () => {
  const id = backendKey(createInput.title);
  state.data.set('projects/' + id, { ...project, id });
  expect(await repo.createProject(createInput, 'bob')).toEqual({
    ...project,
    id,
  });
  expect(state.writes).toHaveLength(0);
});
it('propagates transaction failure atomically and allows deterministic retry after failure', async () => {
  state.failCommit = true;
  await expect(repo.createProject(createInput, 'alice')).rejects.toThrow(
    'permission-denied',
  );
  expect(state.data.has('projects/' + backendKey(createInput.title))).toBe(
    false,
  );
  expect(state.writes).toHaveLength(0);
  expect(
    trace.mock.calls.filter(([event]) => event === 'transaction.commit'),
  ).toEqual([]);
  state.failCommit = false;
  expect((await repo.createProject(createInput, 'alice')).id).toBe(
    backendKey(createInput.title),
  );
  expect(state.writes).toHaveLength(2);
});

function expectTransactionTrace(
  operation: string,
  reads: Array<[string, number]>,
  writes: number,
) {
  expect(state.reads).toEqual(reads.map(([path]) => path));
  expect(trace.mock.calls).toEqual([
    ...reads.flatMap(([path, count]) => {
      const detail = {
        operation,
        collection: path.slice(0, path.lastIndexOf('/')),
        path,
        source: 'remote-transaction',
      };
      return [
        ['transaction.read', detail],
        ['transaction.result', { ...detail, count }],
      ];
    }),
    [
      'transaction.commit',
      { operation, count: writes, source: 'remote-confirmed' },
    ],
  ]);
}

it('traces project uniqueness reads including absent and existing results without payloads', async () => {
  const result = await repo.createProject(createInput, 'alice');
  expectTransactionTrace(
    'web-work.create-project',
    [['projects/' + result.id, 0]],
    2,
  );
  trace.mockClear();
  state.reads.length = 0;
  await repo.createProject(createInput, 'alice');
  expectTransactionTrace(
    'web-work.create-project',
    [['projects/' + result.id, 1]],
    0,
  );
  expect(state.writes).toHaveLength(2);
});

it.each([
  [
    'update-project',
    'trace-project',
    () =>
      repo.updateProject(
        {
          projectId: 'p',
          title: 'Edited',
          requestId: 'trace-project',
          reason: 'Private reason',
        },
        'alice',
      ),
  ],
  [
    'archive',
    'archive_trace-archive',
    () =>
      repo.archiveProject(
        {
          projectId: 'p',
          archived: true,
          requestId: 'trace-archive',
          reason: 'Private reason',
        },
        'alice',
      ),
  ],
  [
    'update-topic',
    'topic_alice_trace-topic',
    () =>
      repo.updateTopic(
        {
          projectId: 'p',
          topicId: 'general',
          title: 'Edited',
          requestId: 'trace-topic',
          reason: 'Private reason',
        },
        'alice',
      ),
  ],
] as const)(
  'traces %s document and audit in their original sequential order',
  async (operation, auditId, execute) => {
    await execute();
    expectTransactionTrace(
      'web-work.' + operation,
      [
        ['projects/p', 1],
        ['projects/p/audit/' + auditId, 0],
      ],
      2,
    );
    expect(state.writes).toHaveLength(2);
  },
);

it.each([false, true])(
  'traces record edit reads without extra reads when destination is explicit: %s',
  async (explicitTarget) => {
    state.data.set('projects/q', { ...project, title: 'Private target' });
    await repo.updateRecord(
      {
        recordId: 'r',
        requestId: 'trace-record',
        reason: 'Private reason',
        ...(explicitTarget
          ? { projectId: 'q', topics: [{ topicId: 'general' }] }
          : { endedAt: null }),
      },
      'alice',
    );
    expectTransactionTrace(
      'web-work.update-record',
      [
        ['users/alice/records/r', 1],
        ['users/alice/records/r/audit/trace-record', 0],
        ['projects/p', 1],
        ...(explicitTarget ? [['projects/q', 1] as [string, number]] : []),
      ],
      2,
    );
    expect(state.writes).toHaveLength(2);
  },
);
