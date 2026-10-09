import { it, expect } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreSplitRepository } from './firestore-split.js';
import { FirestoreWorkRepository } from '../../registration/infrastructure/firestore-work.js';
import { splitInput } from '../domain/split.js';
const now = Date.parse('2026-10-09T18:00:00Z');
const input = splitInput.parse({
  recordId: 'source',
  segmentStartedAt: '2026-10-09T13:00:00Z',
  segmentEndedAt: '2026-10-09T14:00:00Z',
  destinationProjectId: 'dest',
  destinationTopics: [{ topicId: 'general', percentage: 100 }],
  requestId: 'split-1',
  reason: 'Reatribuição explícita',
});
interface Ref {
  path: string;
  id: string;
  collection(name: string): Collection;
}
interface Collection {
  doc(id: string): Ref;
}
function fixture() {
  const data = new Map<string, Record<string, unknown>>();
  const source = {
    id: 'source',
    uid: 'alice',
    projectId: 'origin',
    startedAt: '2026-10-09T12:00:00Z',
    endedAt: '2026-10-09T16:00:00Z',
    timeZone: 'UTC',
    originalText: 'Evidência',
    interpretation: 'Contexto',
    requestId: 'original',
    fingerprint: 'original-fingerprint',
    topics: [{ topicId: 'general', percentage: 100 }],
    privateCustom: { preserved: true },
  };
  data.set('users/alice/records/source', source);
  for (const id of ['origin', 'dest'])
    data.set('projects/' + id, {
      id,
      type: 'work',
      title: id,
      description: 'Contexto projeto',
      topics: [{ id: 'general', title: 'Geral', description: 'Tópico geral' }],
    });
  const ref = (path: string): Ref => ({
    path,
    id: path.split('/').at(-1)!,
    collection: (name) => collection(path + '/' + name),
  });
  const collection = (path: string): Collection => ({
    doc: (id) => ref(path + '/' + id),
  });
  let writes = 0,
    failWrite = false;
  const db = {
    collection,
    runTransaction: async (
      work: (tx: {
        get(r: Ref): Promise<unknown>;
        set(r: Ref, v: Record<string, unknown>): void;
        create(r: Ref, v: Record<string, unknown>): void;
      }) => Promise<unknown>,
    ) => {
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
          pending.push(() => data.set(r.path, structuredClone(v))),
        create: (r: Ref, v: Record<string, unknown>) => {
          if (data.has(r.path)) throw new Error('exists');
          pending.push(() => data.set(r.path, structuredClone(v)));
        },
      };
      const result = await work(tx);
      if (failWrite && pending.length)
        throw new Error('injected transaction failure');
      pending.forEach((op) => {
        op();
        writes++;
      });
      return result;
    },
  } as unknown as Firestore;
  return {
    data,
    db,
    source,
    repo: new FirestoreSplitRepository(db),
    writes: () => writes,
    fail: () => {
      failWrite = true;
    },
  };
}
it('preview writes nothing, confirms atomic exact partition with evidence and replay no duplicates', async () => {
  const f = fixture();
  const preview = await f.repo.splitRecord(input, 'alice', now);
  expect(f.writes()).toBe(0);
  expect(preview.parts.map((p) => p.milliseconds)).toEqual([
    3600000, 3600000, 7200000,
  ]);
  const confirmed = await f.repo.splitRecord(
    { ...input, confirmed: true, previewToken: preview.previewToken },
    'alice',
    now,
  );
  expect(confirmed.parts[0]!.recordId).toBe('source');
  expect(confirmed.totalMilliseconds).toBe(4 * 3600000);
  expect(confirmed.parts[1]!.data.projectId).toBe('dest');
  expect(confirmed.parts[1]!.data.fingerprint).toBeUndefined();
  expect(confirmed.parts[1]!.data.requestId).toBeUndefined();
  expect(confirmed.parts[1]!.data.splitSourceFingerprint).toBe(
    'original-fingerprint',
  );
  expect(
    confirmed.parts.every(
      (p) =>
        JSON.stringify(p.data.privateCustom) ===
        JSON.stringify(f.source.privateCustom),
    ),
  ).toBe(true);
  expect(confirmed.parts[0]!.data.fingerprint).toBe('original-fingerprint');
  const audit = f.data.get('users/alice/splitAudits/' + confirmed.operationId)!;
  expect(audit.before).toEqual(f.source);
  const count = f.writes();
  expect(
    await f.repo.splitRecord(
      { ...input, confirmed: true, previewToken: preview.previewToken },
      'alice',
      now + 1000,
    ),
  ).toEqual(confirmed);
  expect(f.writes()).toBe(count);
  await expect(
    f.repo.splitRecord(
      {
        ...input,
        reason: 'Outra intenção',
        confirmed: true,
        previewToken: preview.previewToken,
      },
      'alice',
      now,
    ),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
});
it('handles left edge, right edge and full transfer without zero records or lost total', async () => {
  for (const [start, end, roles] of [
    ['12', '14', ['moved', 'after']],
    ['14', '16', ['before', 'moved']],
    ['12', '16', ['moved']],
  ] as const) {
    const f = fixture();
    const args = {
      ...input,
      segmentStartedAt: '2026-10-09T' + start + ':00:00Z',
      segmentEndedAt: '2026-10-09T' + end + ':00:00Z',
    };
    const p = await f.repo.splitRecord(args, 'alice', now);
    expect(p.parts.map((x) => x.role)).toEqual(roles);
    expect(p.totalMilliseconds).toBe(14400000);
    expect(p.parts[0]!.recordId).toBe('source');
    await f.repo.splitRecord(
      { ...args, confirmed: true, previewToken: p.previewToken },
      'alice',
      now,
    );
    expect(f.data.get('users/alice/records/source')!.projectId).toBe(
      start === '12' ? 'dest' : 'origin',
    );
  }
});
it('rejects changed source/project or missing confirmation token with zero writes', async () => {
  for (const path of ['users/alice/records/source', 'projects/dest']) {
    const f = fixture();
    const p = await f.repo.splitRecord(input, 'alice', now);
    f.data.set(path, { ...f.data.get(path), originalText: 'Concorrência' });
    await expect(
      f.repo.splitRecord(
        { ...input, confirmed: true, previewToken: p.previewToken },
        'alice',
        now,
      ),
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(f.writes()).toBe(0);
  }
  const f = fixture();
  await expect(
    f.repo.splitRecord({ ...input, confirmed: true }, 'alice', now),
  ).rejects.toThrow();
  expect(f.writes()).toBe(0);
});
it('rejects opens, malformed times, invalid bounds, foreign sources and allocation ambiguities', async () => {
  for (const patch of [
    { endedAt: null },
    { endedAt: undefined },
    { endedAt: 'invalid' },
    { uid: 'bob' },
    { topics: [{ topicId: 'general', durationMinutes: 120 }] },
    { interruptions: [{ description: 'Pausa', durationMinutes: 15 }] },
  ]) {
    const f = fixture();
    f.data.set('users/alice/records/source', { ...f.source, ...patch });
    await expect(f.repo.splitRecord(input, 'alice', now)).rejects.toThrow();
    expect(f.writes()).toBe(0);
  }
  for (const patch of [
    { segmentStartedAt: '2026-10-09T11:00:00Z' },
    { segmentEndedAt: '2026-10-09T17:00:00Z' },
    { segmentEndedAt: input.segmentStartedAt },
  ])
    await expect(
      fixture().repo.splitRecord({ ...input, ...patch }, 'alice', now),
    ).rejects.toThrow();
});
it('rechecks destination ACL, missing metadata, archived and canonical topics', async () => {
  for (const project of [
    undefined,
    { type: 'personal', createdBy: 'bob' },
    { type: 'work', archived: true },
    {
      type: 'work',
      topics: [{ id: 'general', title: 'Geral', mergedIntoTopicId: 'new' }],
    },
  ]) {
    const f = fixture();
    if (project)
      f.data.set('projects/dest', {
        ...f.data.get('projects/dest'),
        ...project,
      });
    else f.data.delete('projects/dest');
    await expect(f.repo.splitRecord(input, 'alice', now)).rejects.toThrow();
    expect(f.writes()).toBe(0);
  }
});
it('rolls back transaction failure and refuses deterministic ID collisions', async () => {
  const f = fixture();
  const p = await f.repo.splitRecord(input, 'alice', now);
  f.fail();
  await expect(
    f.repo.splitRecord(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
      now,
    ),
  ).rejects.toThrow('injected');
  expect(f.data.get('users/alice/records/source')).toEqual(f.source);
  expect(f.writes()).toBe(0);
  const g = fixture();
  const q = await g.repo.splitRecord(input, 'alice', now);
  g.data.set('users/alice/records/' + q.parts[1]!.recordId, {
    unrelated: true,
  });
  await expect(
    g.repo.splitRecord(
      { ...input, confirmed: true, previewToken: q.previewToken },
      'alice',
      now,
    ),
  ).rejects.toMatchObject({ code: 'aborted' });
  expect(g.writes()).toBe(0);
});
it('rejects personal foreign/orphan source and post-confirm changed facts', async () => {
  for (const project of [undefined, { type: 'personal', createdBy: 'bob' }]) {
    const f = fixture();
    if (project)
      f.data.set('projects/origin', {
        ...f.data.get('projects/origin'),
        ...project,
      });
    else f.data.delete('projects/origin');
    await expect(f.repo.splitRecord(input, 'alice', now)).rejects.toThrow();
    expect(f.writes()).toBe(0);
  }
  const f = fixture();
  const p = await f.repo.splitRecord(input, 'alice', now);
  await f.repo.splitRecord(
    { ...input, confirmed: true, previewToken: p.previewToken },
    'alice',
    now,
  );
  f.data.set('users/alice/records/source', {
    ...f.data.get('users/alice/records/source'),
    endedAt: '2026-10-09T12:30:00Z',
  });
  await expect(
    f.repo.splitRecord(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
      now,
    ),
  ).rejects.toMatchObject({ code: 'aborted' });
});
it('refuses oversized audit and private extra metadata publication without writes', async () => {
  const f = fixture();
  f.data.set('users/alice/records/source', {
    ...f.source,
    originalText: 'x'.repeat(240000),
  });
  await expect(f.repo.splitRecord(input, 'alice', now)).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(f.writes()).toBe(0);
  const g = fixture();
  g.data.set('projects/origin', {
    ...g.data.get('projects/origin'),
    type: 'personal',
    createdBy: 'alice',
  });
  await expect(g.repo.splitRecord(input, 'alice', now)).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(g.writes()).toBe(0);
});
it('requires explicit publication acknowledgment on private-to-work confirmation and replay', async () => {
  const f = fixture();
  const source = { ...f.source };
  delete (source as Partial<typeof source>).privateCustom;
  f.data.set('users/alice/records/source', source);
  f.data.set('projects/origin', {
    ...f.data.get('projects/origin'),
    type: 'personal',
    createdBy: 'alice',
  });
  const p = await f.repo.splitRecord(input, 'alice', now);
  expect(p.requiresSharedAcknowledgment).toBe(true);
  expect(p.warnings.join(' ')).toContain('visíveis');
  await expect(
    f.repo.splitRecord(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
      now,
    ),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.writes()).toBe(0);
  const result = await f.repo.splitRecord(
    {
      ...input,
      confirmed: true,
      previewToken: p.previewToken,
      acknowledgeSharedDestination: true,
    },
    'alice',
    now,
  );
  expect(result.parts[1]!.data.projectSnapshot).toMatchObject({
    title: 'dest',
  });
  expect(result.parts[1]!.data.originalText).toBe(source.originalText);
  expect(
    f.data.get('users/alice/splitAudits/' + result.operationId)!
      .acknowledgeSharedDestination,
  ).toBe(true);
  const count = f.writes();
  await expect(
    f.repo.splitRecord(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
      now,
    ),
  ).rejects.toThrow();
  expect(f.writes()).toBe(count);
});
it('original register retry returns post-split duplicate without resurrecting original interval', async () => {
  const f = fixture();
  const work = new FirestoreWorkRepository(f.db);
  const registration = {
    projectId: 'origin',
    startedAt: '2026-10-09T12:00:00Z',
    endedAt: '2026-10-09T16:00:00Z',
    timeZone: 'UTC',
    originalText: 'Registro factual',
    interpretation: 'Contexto',
    requestId: 'original-register',
  };
  const original = await work.register(registration, 'alice');
  const args = { ...input, recordId: original.id as string };
  const p = await f.repo.splitRecord(args, 'alice', now);
  await f.repo.splitRecord(
    { ...args, confirmed: true, previewToken: p.previewToken },
    'alice',
    now,
  );
  const count = f.writes();
  const duplicate = await work.register(registration, 'alice');
  expect(duplicate.duplicate).toBe(true);
  expect(duplicate.endedAt).toBe(input.segmentStartedAt);
  expect(f.writes()).toBe(count);
});
it('uses actual offset instants and falls back explicitly to unique Geral', async () => {
  const f = fixture();
  const p = await f.repo.splitRecord(
    {
      ...input,
      segmentStartedAt: '2026-10-09T10:00:00-03:00',
      segmentEndedAt: '2026-10-09T11:00:00-03:00',
      destinationTopics: [],
    },
    'alice',
    now,
  );
  expect(p.parts[1]!.milliseconds).toBe(3600000);
  expect(p.parts[1]!.data.topics).toEqual([{ topicId: 'general' }]);
});
