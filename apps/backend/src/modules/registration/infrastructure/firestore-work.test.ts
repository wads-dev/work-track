import { expect, it, vi } from 'vitest';
import { Firestore, Query, type QuerySnapshot } from 'firebase-admin/firestore';
import type { Project } from '@work-track/core/registration/domain/work-model';
import { FirestoreWorkRepository } from './firestore-work.js';
it('persists default topics and isolates idempotent records by user', async () => {
  const data = new Map<string, Record<string, unknown>>();
  const doc = (path: string): unknown => ({
    path,
    id: path.split('/').at(-1),
    collection: (name: string) => ({
      doc: (id: string) => doc(path + '/' + name + '/' + id),
    }),
  });
  const tx = {
    get: (ref: { path: string }) =>
      Promise.resolve({
        exists: data.has(ref.path),
        id: ref.path.split('/').at(-1),
        data: () => data.get(ref.path),
      }),
    create: (ref: { path: string }, value: Record<string, unknown>) => {
      data.set(ref.path, value);
    },
    update: (ref: { path: string }, value: Record<string, unknown>) => {
      data.set(ref.path, { ...data.get(ref.path), ...value });
    },
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => doc(name + '/' + id),
    }),
    runTransaction: (work: (t: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as Firestore;
  const repo = new FirestoreWorkRepository(db);
  const project = await repo.createProject(
    {
      type: 'work',
      title: 'Work Track',
      description: 'Registro de atividades pessoais e profissionais.',
    },
    'alice',
  );
  expect(project.topics[0]?.id).toBe('general');
  const topicUpdate = {
    projectId: project.id,
    topicId: 'general',
    githubUrl: 'https://github.com/wads-dev/work-track',
    requestId: 'github-topic',
    reason: 'associação solicitada',
  };
  expect(await repo.updateTopic(topicUpdate, 'alice')).toMatchObject({
    id: 'general',
    githubUrl: topicUpdate.githubUrl,
  });
  const size = data.size;
  await repo.updateTopic(topicUpdate, 'alice');
  expect(data.size).toBe(size);
  await expect(
    repo.updateTopic({ ...topicUpdate, githubUrl: null }, 'alice'),
  ).rejects.toThrow('requestId');
  expect(
    [...data.entries()].find(([path]) => path.includes('/audit/topic_'))?.[1],
  ).toMatchObject({
    authorUid: 'alice',
    before: { id: 'general' },
    after: { githubUrl: topicUpdate.githubUrl },
  });
  const input = {
    projectId: project.id,
    startedAt: '2026-10-08T21:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
    originalText: 'Comecei agora',
    interpretation: 'Início sem fim',
    requestId: 'one',
  };
  const saved = await repo.register(input, 'alice');
  expect(saved.topics).toEqual([{ topicId: 'general' }]);
  expect(saved.endedAt).toBeNull();
  expect(saved.deletedAt).toBeNull();
  expect(saved).not.toHaveProperty('topicResolution');
  expect(saved).not.toHaveProperty('warnings');
  expect(project.topics[0]?.archived).toBe(false);
  expect(
    data.get('users/alice/records/' + String(saved.id))?.endedAt,
  ).toBeNull();
  expect(saved.uid).toBe('alice');
  expect((await repo.register(input, 'alice')).duplicate).toBe(true);
  expect(
    (await repo.register({ ...input, closePrevious: false }, 'alice'))
      .duplicate,
  ).toBe(true);
  await expect(
    repo.register({ ...input, originalText: 'Different' }, 'alice'),
  ).rejects.toThrow('requestId');
  expect((await repo.register(input, 'bob')).duplicate).toBe(false);
  await expect(
    repo.register(
      { ...input, requestId: 'two', topics: [{ topicId: 'missing' }] },
      'alice',
    ),
  ).rejects.toThrow('Tópico');
  const confirmed = {
    ...input,
    requestId: 'confirmed-switch',
    startedAt: '2026-10-08T22:00:00-03:00',
    closePrevious: true,
    closedPreviousRecordId: saved.id as string,
    closePreviousReason: 'Usuário confirmou troca',
  };
  const switched = await repo.register(confirmed, 'alice');
  expect(switched.closedPreviousRecordId).toBe(saved.id);
  const previous = data.get('users/alice/records/' + String(saved.id));
  expect(previous).toMatchObject({
    endedAt: confirmed.startedAt,
    originalText: input.originalText,
    requestId: input.requestId,
  });
  const audits = [...data.keys()].filter((path) =>
    path.includes('/audit/close_'),
  );
  expect(audits).toHaveLength(1);
  expect((await repo.register(confirmed, 'alice')).duplicate).toBe(true);
  expect(
    [...data.keys()].filter((path) => path.includes('/audit/close_')),
  ).toHaveLength(1);
  await expect(
    repo.register(
      {
        ...confirmed,
        closePrevious: false,
        closedPreviousRecordId: undefined,
        closePreviousReason: undefined,
      },
      'alice',
    ),
  ).rejects.toThrow('requestId');
  expect(
    [...data.keys()].some((path) => path.startsWith('users/alice/records/')),
  ).toBe(true);

  const open = await repo.register(
    { ...input, requestId: 'canonical-open' },
    'alice',
  );
  expect(open).not.toHaveProperty('topicResolution');
  expect(open).not.toHaveProperty('warnings');
  data.set('projects/' + project.id, {
    ...data.get('projects/' + project.id),
    topics: [
      ...project.topics,
      {
        id: 'old',
        title: 'Historical alias',
        description: 'Unsupported historical catalog entry',
        archived: true,
        mergedIntoTopicId: 'general',
      },
    ],
  });
  const initial = structuredClone(data);
  const create = vi.spyOn(tx, 'create');
  const update = vi.spyOn(tx, 'update');
  try {
    for (const topicId of ['old', 'general']) {
      await expect(
        repo.register(
          {
            ...confirmed,
            requestId: 'historical-alias-' + topicId,
            closedPreviousRecordId: open.id as string,
            topics: [{ topicId }],
          },
          'alice',
        ),
      ).rejects.toMatchObject({
        code: 'failed-precondition',
        message: 'Catálogo de tópicos contém aliases não suportados.',
      });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(data).toEqual(initial);
    }
  } finally {
    create.mockRestore();
    update.mockRestore();
  }
});

it('queries recent branches and compacts exact instants with one captured now and visible-ID pagination', async () => {
  const at = new Date('2026-10-11T03:00:00Z');
  vi.useFakeTimers();
  vi.setSystemTime(at);
  const project: Project = {
    id: 'p',
    title: 'Projeto',
    description: 'Teste',
    createdBy: 'alice',
    createdAt: '2026-10-01T00:00:00Z',
    type: 'personal',
    archived: true,
    confidential: false,
    topics: [],
  };
  const data = [
    {
      id: 'lexically-later',
      startedAt: '2026-10-11T02:00:00+02:00',
      endedAt: '2026-10-11T02:30:00+02:00',
    },
    { id: 'chronologically-later', startedAt: '2026-10-10T23:30:00-02:00' },
    { id: 'old-open', startedAt: '2026-09-01T00:00:00Z', endedAt: null },
    { id: 'null-open', startedAt: '2026-09-02T00:00:00Z', endedAt: null },
    {
      id: 'span',
      startedAt: '2026-09-03T00:00:00Z',
      endedAt: '2026-10-12T00:00:00Z',
    },
    {
      id: 'lower-edge',
      startedAt: '2026-10-09T03:01:00-23:59',
      endedAt: '2026-10-10T04:00:00Z',
    },
    { id: 'padded-future', startedAt: '2026-10-11T04:00:00Z' },
    { id: 'far-future', startedAt: '2026-12-01T00:00:00Z' },
    {
      id: 'old-closed',
      startedAt: '2026-09-01T00:00:00Z',
      endedAt: '2026-09-02T00:00:00Z',
    },
    {
      id: 'deleted',
      startedAt: '2026-10-11T00:00:00Z',
      deletedAt: '2026-10-11T01:00:00Z',
    },
    {
      id: 'unknown-project',
      startedAt: '2026-10-11T00:00:00Z',
      projectId: 'unknown',
    },
    { id: 'foreign-owner', startedAt: '2026-10-11T00:00:00Z', uid: 'bob' },
  ].map((record) => ({
    uid: 'alice',
    projectId: 'p',
    endedAt: null,
    deletedAt: null,
    topics: [],
    timeZone: 'UTC',
    ...record,
  }));
  type NativeFilter = {
    unaryFilter?: { field: { fieldPath: string }; op: string };
    fieldFilter: {
      field: { fieldPath: string };
      op: string;
      value: { stringValue: string };
    };
  };
  const requests: Array<{ filters: NativeFilter[]; limit: number }> = [];
  const get = vi.spyOn(Query.prototype, 'get').mockImplementation(function (
    this: Query,
  ) {
    // Real SDK constructs/serializes every query. Only execution is replaced by
    // synthetic data; all native predicates actually select this fixture.
    const proto = (
      this as Query & {
        toProto(): {
          structuredQuery: {
            where: { compositeFilter: { filters: NativeFilter[] } };
            limit: { value: number };
          };
        };
      }
    ).toProto().structuredQuery;
    const filters = proto.where.compositeFilter.filters;
    requests.push({ filters, limit: proto.limit.value });
    const docs = data
      .filter((record) =>
        filters.every(({ fieldFilter, unaryFilter }) => {
          if (unaryFilter)
            return (
              (record as Record<string, unknown>)[
                unaryFilter.field.fieldPath
              ] === null
            );
          const value: unknown = (record as Record<string, unknown>)[
            fieldFilter.field.fieldPath
          ];
          if (typeof value !== 'string') return false;
          const selected = fieldFilter.value.stringValue;
          if (fieldFilter.op === 'EQUAL') return value === selected;
          if (fieldFilter.op === 'LESS_THAN') return value < selected;
          if (fieldFilter.op === 'GREATER_THAN_OR_EQUAL')
            return value >= selected;
          throw new Error('Unexpected native predicate');
        }),
      )
      .slice(0, proto.limit.value)
      .map(({ id, ...record }) => ({ id, data: () => record }));
    // Simulate query/catalog time elapsing across the request boundary.
    vi.setSystemTime(new Date('2026-10-11T05:00:00Z'));
    return Promise.resolve({ docs } as unknown as QuerySnapshot);
  });
  const repository = new FirestoreWorkRepository(
    new Firestore({ projectId: 'demo-recent-repository' }),
  );
  const projects = vi
    .spyOn(repository, 'listProjects')
    .mockResolvedValue([project]);
  try {
    const first = await repository.listRecentRecords(
      { hours: 24, limit: 2 },
      'alice',
    );
    expect(first).toMatchObject({
      queriedAt: at.toISOString(),
      hasMore: true,
      nextCursor: 'lexically-later',
    });
    expect(first.records.map((record) => record.id)).toEqual([
      'chronologically-later',
      'lexically-later',
    ]);
    vi.setSystemTime(at);
    const rest = await repository.listRecentRecords(
      { hours: 24, limit: 100, cursor: 'lexically-later' },
      'alice',
    );
    expect(rest.records.map((record) => record.id)).toEqual([
      'lower-edge',
      'span',
      'null-open',
      'old-open',
    ]);
    expect(rest).toMatchObject({
      queriedAt: at.toISOString(),
      hasMore: false,
      nextCursor: null,
    });
    expect(requests).toHaveLength(6);
    for (const { filters } of requests) {
      expect(
        filters
          .filter((f) => f.fieldFilter)
          .map(({ fieldFilter }) => [
            fieldFilter.field.fieldPath,
            fieldFilter.op,
            fieldFilter.value.stringValue,
          ]),
      ).toEqual(
        expect.arrayContaining([
          ['uid', 'EQUAL', 'alice'],
          ['startedAt', 'LESS_THAN', '2026-10-13'],
        ]),
      );
    }
    expect(projects).toHaveBeenCalledWith('alice');
  } finally {
    projects.mockRestore();
    get.mockRestore();
    vi.useRealTimers();
  }
});
