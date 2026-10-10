import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreRecordMovementRepository } from './firestore-record-movement.js';
import { moveTopicInput, moveRecordInput } from '../domain/record-movement.js';
import { movementHandler } from '../presentation/record-movement.js';
function fixture() {
  const data = new Map<string, Record<string, unknown>>([
    [
      'projects/a',
      {
        id: 'a',
        type: 'work',
        createdBy: 'alice',
        title: 'A',
        description: 'source',
        topics: [{ id: 's', title: 'Análise', description: 'original' }],
      },
    ],
    [
      'projects/b',
      {
        id: 'b',
        type: 'work',
        createdBy: 'bob',
        title: 'B',
        description: 'target',
        topics: [],
      },
    ],
  ]);
  let abort = false;
  const writes = vi.fn();
  const ref = (path: string) => ({
    path,
    id: path.split('/').at(-1)!,
    collection: (name: string) => collection(path + '/' + name),
  });
  const snap = (path: string) => ({
    ref: ref(path),
    id: path.split('/').at(-1)!,
    exists: data.has(path),
    data: () => data.get(path),
    updateTime: { toMillis: () => 1, nanoseconds: 0 },
  });
  function collection(
    path: string,
    field?: string,
    value?: unknown,
    cap = Infinity,
    group = false,
  ) {
    return {
      path,
      query: true,
      field,
      value,
      cap,
      group,
      doc: (id: string) => ref(path + '/' + id),
      where: (f: string, _op: string, v: unknown) =>
        collection(path, f, v, cap, group),
      limit: (n: number) => collection(path, field, value, n, group),
    };
  }
  const db = {
    collection: (p: string) => collection(p),
    collectionGroup: (p: string) =>
      collection(p, undefined, undefined, Infinity, true),
    doc: ref,
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: (r: {
          path: string;
          query?: boolean;
          field?: string;
          value?: unknown;
          cap?: number;
          group?: boolean;
        }) =>
          Promise.resolve(
            r.query
              ? (() => {
                  const docs = [...data.keys()]
                    .filter(
                      (p) =>
                        (r.group
                          ? p.split('/').at(-2) === r.path
                          : p.startsWith(r.path + '/') &&
                            !p.slice(r.path.length + 1).includes('/')) &&
                        (!r.field || data.get(p)![r.field] === r.value),
                    )
                    .slice(0, r.cap)
                    .map(snap);
                  return { docs, empty: docs.length === 0 };
                })()
              : snap(r.path),
          ),
        update: (r: { path: string }, v: Record<string, unknown>) => {
          writes(r.path);
          pending.push(() => data.set(r.path, { ...data.get(r.path), ...v }));
        },
        create: (r: { path: string }, v: Record<string, unknown>) => {
          writes(r.path);
          pending.push(() => {
            if (data.has(r.path)) throw new Error('exists');
            data.set(r.path, v);
          });
        },
      });
      if (abort) throw new Error('abort');
      pending.forEach((f) => f());
      return result;
    },
  };
  const add = (id = 'r', patch: Record<string, unknown> = {}) =>
    data.set('users/alice/records/' + id, {
      id,
      uid: 'alice',
      projectId: 'a',
      topics: [{ topicId: 's', percentage: 35, durationMinutes: 17 }],
      originalText: 'immutable',
      interpretation: 'immutable',
      startedAt: '2026-10-09T01:00:00Z',
      endedAt: '2026-10-09T02:00:00Z',
      fingerprint: 'old',
      topicSnapshots: [{ id: 's', title: 'Análise', description: 'original' }],
      projectSnapshot: { title: 'A', description: 'source' },
      ...patch,
    });
  add();
  return {
    data,
    add,
    writes,
    repo: new FirestoreRecordMovementRepository(db as unknown as Firestore),
    abort: () => (abort = true),
  };
}
const input = moveTopicInput.parse({
  project_origin: 'a',
  topic_origin: 's',
  project_target: 'b',
  requestId: 'op',
  reason: 'Organizar atividades',
});
async function preview(f: ReturnType<typeof fixture>) {
  return (await f.repo.moveTopic(input, 'alice')) as {
    mode: string;
    previewToken: string;
    topic_target: string;
    resolvedTopic: { willCreate: boolean };
    recordCount: number;
  };
}
it('preview0writes defaults originalname create audit EACH record preservesfacts sourceforeign and repeatnoextraaudit', async () => {
  const f = fixture();
  f.add('r2');
  f.add('deleted', { deletedAt: false });
  f.data.set('users/bob/records/foreign', {
    uid: 'bob',
    projectId: 'a',
    topics: [{ topicId: 's' }],
  });
  const before = { ...f.data.get('users/alice/records/r')! };
  const p = await preview(f);
  expect(p).toMatchObject({
    mode: 'preview',
    recordCount: 3,
    resolvedTopic: { willCreate: true },
  });
  expect(f.writes).not.toHaveBeenCalled();
  const confirmed = { ...input, confirmed: true, previewToken: p.previewToken };
  const result = await f.repo.moveTopic(confirmed, 'alice');
  expect(result).toMatchObject({ mode: 'execution', recordCount: 3 });
  const after = f.data.get('users/alice/records/r')!;
  expect(after).toMatchObject({
    id: 'r',
    uid: 'alice',
    projectId: 'b',
    originalText: before.originalText,
    interpretation: before.interpretation,
    startedAt: before.startedAt,
    endedAt: before.endedAt,
    fingerprint: 'old',
    topics: [{ topicId: p.topic_target, percentage: 35, durationMinutes: 17 }],
    projectSnapshot: { title: 'B', description: 'target' },
  });
  expect(after.topicSnapshots).toEqual([
    { id: p.topic_target, title: 'Análise', description: 'original' },
  ]);
  expect(f.data.get('users/alice/records/deleted')!.projectId).toBe('a');
  expect(f.data.get('users/bob/records/foreign')!.projectId).toBe('b');
  expect(f.data.get('projects/a')!.topics).toEqual([
    { id: 's', title: 'Análise', description: 'original' },
  ]);
  const audits = [...f.data.entries()].filter(
    ([path]) => path.includes('/records/') && path.includes('/audit/'),
  );
  expect(audits).toHaveLength(3);
  expect(audits[0]![1]).toMatchObject({
    action: 'move_topic',
    reason: input.reason,
    before: { projectId: 'a' },
    after: { projectId: 'b' },
  });
  const count = f.writes.mock.calls.length;
  expect(await f.repo.moveTopic(confirmed, 'alice')).toEqual(result);
  expect(f.writes).toHaveBeenCalledTimes(count);
  await expect(
    f.repo.moveTopic({ ...confirmed, reason: 'other' }, 'alice'),
  ).rejects.toThrow('Retry');
  f.data.get('users/alice/records/r')!.endedAt = 'changed';
  await expect(f.repo.moveTopic(confirmed, 'alice')).rejects.toThrow(
    'Estado alterado',
  );
});
it('record movement explicit target reuses canonical topic; strict callable no UID injection auth', async () => {
  const f = fixture();
  f.data.get('projects/b')!.topics = [
    { id: 'dest', title: 'Different', description: 'known' },
  ];
  const ri = moveRecordInput.parse({
    recordId: 'r',
    project_target: 'b',
    topic_target: 'dest',
    requestId: 'single',
    reason: 'Mover registro',
  });
  const p = (await f.repo.moveRecord(ri, 'alice')) as { previewToken: string };
  await f.repo.moveRecord(
    { ...ri, confirmed: true, previewToken: p.previewToken },
    'alice',
  );
  expect(f.data.get('users/alice/records/r')!.topics).toEqual([
    { topicId: 'dest', percentage: 35, durationMinutes: 17 },
  ]);
  await expect(
    movementHandler(f.repo, 'move_record', ri),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  const auth = {
    uid: 'alice',
    token: {
      email: 'alice@wads.dev',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    },
  };
  await expect(
    movementHandler(f.repo, 'move_topic', { ...input, uid: 'bob' }, auth),
  ).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(
    movementHandler(f.repo, 'move_topic', { ...input, confirmed: true }, auth),
  ).rejects.toMatchObject({ code: 'invalid-argument' });
});
it('mixed topics, malformed ownership, deleted single and crossscope reject all-or-none', async () => {
  for (const patch of [
    { topics: [{ topicId: 's' }, { topicId: 'x' }] },
    { uid: 'bob' },
    { topicResolution: [{ sourceTopicId: 'old', targetTopicId: 's' }] },
  ]) {
    const f = fixture();
    f.add('r', patch);
    await expect(preview(f)).rejects.toThrow();
    expect(f.writes).not.toHaveBeenCalled();
  }
  const f = fixture();
  f.add('r', { deletedAt: 0 });
  await expect(
    f.repo.moveRecord(
      moveRecordInput.parse({
        recordId: 'r',
        project_target: 'b',
        requestId: 'r',
        reason: 'reason',
      }),
      'alice',
    ),
  ).rejects.toThrow('ativo');
  const g = fixture();
  Object.assign(g.data.get('projects/b')!, {
    type: 'personal',
    createdBy: 'alice',
  });
  await expect(preview(g)).rejects.toThrow('mesmo escopo');
  const h = fixture();
  Object.assign(h.data.get('projects/b')!, {
    type: 'personal',
    createdBy: 'bob',
  });
  await expect(preview(h)).rejects.toThrow();
});
it('ambiguous default explicit target/archive/aliases/merge inbound/zero/sameproject blocked', async () => {
  const f = fixture();
  f.data.get('projects/b')!.topics = [
    { id: 'd1', title: 'Analise', description: 'x' },
    { id: 'd2', title: ' ANÁLISE ', description: 'x' },
  ];
  await expect(preview(f)).rejects.toThrow('ambíguo');
  await expect(
    f.repo.moveTopic({ ...input, topic_target: 'missing' }, 'alice'),
  ).rejects.toThrow('destino');
  for (const patch of [
    { archived: true },
    { mergeLock: 'job' },
    { mergedInto: 'x' },
  ]) {
    const g = fixture();
    Object.assign(g.data.get('projects/a')!, patch);
    await expect(preview(g)).rejects.toThrow();
  }
  const g = fixture();
  g.data.set('projects/old', { mergedInto: 'a' });
  await expect(preview(g)).rejects.toThrow('mesclagem');
  const h = fixture();
  h.data.get('projects/a')!.topics = [
    { id: 's', title: 'Análise', description: 'x' },
    {
      id: 'alias',
      title: 'old',
      description: 'x',
      mergedIntoTopicId: 's',
      archived: true,
    },
  ];
  await expect(preview(h)).rejects.toThrow('aliases');
  const zero = fixture();
  zero.add('r', { deletedAt: 'deleted' });
  await expect(preview(zero)).rejects.toThrow('Nenhum');
  await expect(
    f.repo.moveTopic({ ...input, project_target: 'a' }, 'alice'),
  ).rejects.toThrow('outro');
});
it('normalized unique same-name reused; stale project and matching new record invalidate token', async () => {
  const f = fixture();
  f.data.get('projects/b')!.topics = [
    { id: 'same', title: ' ANALISE ', description: 'keep' },
  ];
  const p = await preview(f);
  expect(p).toMatchObject({
    topic_target: 'same',
    resolvedTopic: { willCreate: false },
  });
  f.add('new');
  await expect(
    f.repo.moveTopic(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
    ),
  ).rejects.toThrow('desatualizada');
  const p2 = await preview(f);
  f.data.get('projects/a')!.title = 'changed';
  await expect(
    f.repo.moveTopic(
      { ...input, confirmed: true, previewToken: p2.previewToken },
      'alice',
    ),
  ).rejects.toThrow('desatualizada');
  expect(f.writes).not.toHaveBeenCalled();
});
it('100 succeeds 101 capfail 2001physical capfail oversized audit abort allatomic', async () => {
  const f = fixture();
  for (let i = 1; i < 100; i++) f.add('r' + i);
  const p = await preview(f);
  expect(p.recordCount).toBe(100);
  await f.repo.moveTopic(
    { ...input, confirmed: true, previewToken: p.previewToken },
    'alice',
  );
  expect(
    [...f.data.keys()].filter(
      (k) => k.includes('/records/') && k.includes('/audit/'),
    ),
  ).toHaveLength(100);
  const g = fixture();
  for (let i = 1; i < 101; i++) g.add('r' + i);
  await expect(preview(g)).rejects.toThrow('100');
  expect(g.writes).not.toHaveBeenCalled();
  const h = fixture();
  for (let i = 1; i < 2001; i++) h.add('r' + i, { deletedAt: 'deleted' });
  await expect(preview(h)).rejects.toThrow('2000');
  const huge = fixture();
  huge.add('r', { originalText: 'x'.repeat(400000) });
  await expect(preview(huge)).rejects.toThrow('Auditoria');
  expect(huge.writes).not.toHaveBeenCalled();
  const abort = fixture();
  const ap = await preview(abort);
  abort.abort();
  await expect(
    abort.repo.moveTopic(
      { ...input, confirmed: true, previewToken: ap.previewToken },
      'alice',
    ),
  ).rejects.toThrow('abort');
  expect(abort.data.get('users/alice/records/r')!.projectId).toBe('a');
  expect(abort.data.get('projects/b')!.topics).toEqual([]);
});
it('corporate actor without own records moves another owner with full audit and stable retry', async () => {
  const f = fixture();
  const before = structuredClone(f.data.get('users/alice/records/r'));
  const p = await f.repo.moveTopic(input, 'bob');
  expect(p).toMatchObject({
    recordCount: 1,
    participantUids: ['alice'],
    records: [
      { ownerUid: 'alice', recordId: 'r', path: 'users/alice/records/r' },
    ],
  });
  expect(f.writes).not.toHaveBeenCalled();
  const confirmed = {
    ...input,
    confirmed: true,
    previewToken: p.previewToken as string,
  };
  const result = await f.repo.moveTopic(confirmed, 'bob');
  expect(f.data.get('users/alice/records/r')).toMatchObject({
    uid: 'alice',
    updatedBy: 'bob',
    projectId: 'b',
  });
  const audit = [...f.data].find(([path]) =>
    path.startsWith('users/alice/records/r/audit/'),
  )![1];
  expect(audit).toMatchObject({
    authorUid: 'bob',
    recordOwnerUid: 'alice',
    recordPath: 'users/alice/records/r',
    before,
    after: { uid: 'alice', projectId: 'b' },
  });
  const n = f.writes.mock.calls.length;
  expect(await f.repo.moveTopic(confirmed, 'bob')).toEqual(result);
  expect(f.writes).toHaveBeenCalledTimes(n);
  await expect(f.repo.moveTopic(confirmed, 'alice')).rejects.toThrow();
});
it('moves explicit corporate record owner without impersonating actor', async () => {
  const f = fixture();
  const request = moveRecordInput.parse({
    recordId: 'r',
    recordOwnerUid: 'alice',
    project_target: 'b',
    requestId: 'record',
    reason: 'Corrigir classificação',
  });
  const p = await f.repo.moveRecord(request, 'bob');
  expect(p).toMatchObject({ records: [{ ownerUid: 'alice' }] });
  await f.repo.moveRecord(
    { ...request, confirmed: true, previewToken: p.previewToken as string },
    'bob',
  );
  expect(f.data.get('users/alice/records/r')).toMatchObject({
    uid: 'alice',
    updatedBy: 'bob',
    projectId: 'b',
  });
});
it('personal access stays owner-only, including recordOwnerUid and replay access loss', async () => {
  const f = fixture();
  for (const id of ['a', 'b'])
    Object.assign(f.data.get('projects/' + id)!, {
      type: 'personal',
      createdBy: 'alice',
    });
  await expect(f.repo.moveTopic(input, 'bob')).rejects.toMatchObject({
    code: 'not-found',
  });
  await expect(
    f.repo.moveRecord(
      moveRecordInput.parse({
        recordId: 'r',
        recordOwnerUid: 'alice',
        project_target: 'b',
        requestId: 'record',
        reason: 'request',
      }),
      'bob',
    ),
  ).rejects.toMatchObject({ code: 'not-found' });
  expect(f.writes).not.toHaveBeenCalled();
  f.data.set('users/bob/records/private', {
    uid: 'bob',
    projectId: 'a',
    topics: [{ topicId: 's' }],
  });
  const p = await preview(f);
  expect(p.recordCount).toBe(1);
  const confirmed = { ...input, confirmed: true, previewToken: p.previewToken };
  await f.repo.moveTopic(confirmed, 'alice');
  expect(f.data.get('users/bob/records/private')!.projectId).toBe('a');
  Object.assign(f.data.get('projects/a')!, { createdBy: 'bob' });
  await expect(f.repo.moveTopic(confirmed, 'alice')).rejects.toMatchObject({
    code: 'not-found',
  });
});
it('cross-owner changes invalidate preview, duplicate record IDs expose distinct paths', async () => {
  const f = fixture();
  f.data.set('users/bob/records/r', {
    ...f.data.get('users/alice/records/r'),
    uid: 'bob',
  });
  const p = await preview(f);
  expect(p.recordCount).toBe(2);
  expect((p as Record<string, unknown>).records).toEqual([
    { recordId: 'r', ownerUid: 'alice', path: 'users/alice/records/r' },
    { recordId: 'r', ownerUid: 'bob', path: 'users/bob/records/r' },
  ]);
  f.data.get('users/bob/records/r')!.originalText = 'Changed';
  await expect(
    f.repo.moveTopic(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
    ),
  ).rejects.toThrow('desatualizada');
  expect(f.writes).not.toHaveBeenCalled();
});
it('foreign personal and missing records produce identical errors without writes', async () => {
  const f = fixture();
  Object.assign(f.data.get('projects/a')!, {
    type: 'personal',
    createdBy: 'alice',
  });
  const request = moveRecordInput.parse({
    recordId: 'r',
    recordOwnerUid: 'alice',
    project_target: 'b',
    requestId: 'private',
    reason: 'Classificar',
  });
  const capture = async (recordId: string) => {
    try {
      await f.repo.moveRecord({ ...request, recordId }, 'bob');
      return null;
    } catch (error) {
      const e = error as Error & { code: string };
      return { code: e.code, message: e.message };
    }
  };
  expect(await capture('r')).toEqual(await capture('missing'));
  expect(f.writes).not.toHaveBeenCalled();
});
it('rejects legacy subject parameters and actor injection in canonical topic schema', () => {
  expect(
    moveTopicInput.safeParse({ ...input, subject_origin: 's' }).success,
  ).toBe(false);
  expect(moveTopicInput.safeParse({ ...input, uid: 'bob' }).success).toBe(
    false,
  );
});
