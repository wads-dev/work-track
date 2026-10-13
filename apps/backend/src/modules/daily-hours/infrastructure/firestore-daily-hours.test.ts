import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreDailyHoursRepository } from './firestore-daily-hours.js';
import {
  buildDailyHours,
  dailyBounds,
  dailyHoursInput,
  type DailyHoursSelection,
  type DailyProject,
} from '@work-track/core/daily-hours/domain/daily-hours';
type Document = { id: string; value: Record<string, unknown> };
type QueryState = {
  where: [string, string, unknown][];
  orderBy: string[];
  cursor?: { id: string };
  limit?: number;
};
function setup(
  pages: Document[][],
  projects: Record<string, DailyProject> = { a: {} },
) {
  let reads = 0,
    historyReads = 0;
  const recordQueries: string[] = [],
    projectReads: string[] = [],
    nativeQueries: QueryState[] = [];
  let options: unknown;
  const query = (state: QueryState = { where: [], orderBy: [] }) => ({
    state,
    where: (field: string, op: string, value: unknown) =>
      query({
        ...state,
        where: [...state.where, [field, op, value]],
      }),
    orderBy: (field: unknown) =>
      query({
        ...state,
        orderBy: [
          ...state.orderBy,
          typeof field === 'string' ? field : '__name__',
        ],
      }),
    startAfter: (cursor: { id: string }) => query({ ...state, cursor }),
    limit: (limit: number) => query({ ...state, limit }),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => {
        if (name === 'projects') return { id };
        recordQueries.push(name + '/' + id + '/records');
        return { collection: (_sub: string) => query() };
      },
    }),
    runTransaction: <T>(work: (tx: unknown) => Promise<T>, opts: unknown) => {
      options = opts;
      return work({
        get: (request: { state: QueryState }) => {
          reads++;
          const state = request.state;
          nativeQueries.push(state);
          let docs: Document[];
          if (state.where.length === 0) docs = pages[historyReads++] ?? [];
          else {
            docs = pages.flat().filter((doc) =>
              state.where.every(([field, op, value]) => {
                if (!(field in doc.value)) return false;
                if (op === '==') return doc.value[field] === value;
                if (op === '<') return String(doc.value[field]) < String(value);
                throw new Error('Unsupported query predicate: ' + op);
              }),
            );
            docs.sort((a, b) => {
              for (const field of state.orderBy) {
                const left =
                  field === '__name__' ? a.id : String(a.value[field]);
                const right =
                  field === '__name__' ? b.id : String(b.value[field]);
                if (left !== right) return left < right ? -1 : 1;
              }
              return 0;
            });
            if (state.cursor)
              docs = docs.slice(
                docs.findIndex((doc) => doc.id === state.cursor!.id) + 1,
              );
            docs = docs.slice(0, state.limit);
          }
          return Promise.resolve({
            docs: docs.map((doc) => ({
              id: doc.id,
              data: () => doc.value,
            })),
          });
        },
        getAll: (...refs: { id: string }[]) =>
          Promise.resolve(
            refs.map((ref) => {
              projectReads.push(ref.id);
              return {
                id: ref.id,
                exists: projects[ref.id] !== undefined,
                data: () => projects[ref.id],
              };
            }),
          ),
      });
    },
  } as unknown as Firestore;
  return {
    repository: new FirestoreDailyHoursRepository(db),
    recordQueries,
    projectReads,
    nativeQueries,
    get reads() {
      return reads;
    },
    get options() {
      return options;
    },
  };
}
const source = (id: string, value: Record<string, unknown> = {}) => ({
  id,
  value: {
    projectId: 'a',
    startedAt: '2026-10-09T08:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
    ...value,
  },
});
const daySelection = (includeArchived = true): DailyHoursSelection => {
  const { start, end } = dailyBounds('2026-10-09', 'America/Sao_Paulo');
  return { startedAt: start, endedAt: end, includeArchived };
};
describe('read-only daily-hours own canonical repository', () => {
  it.each([undefined, null, '2026-10-09T09:00:00-03:00'])(
    'normalizes persisted end %s without mutating facts',
    async (endedAt) => {
      const fact = source('open', { endedAt });
      const { records } = await setup([[fact]]).repository.loadOwnHistory(
        'alice',
      );
      expect(records).toHaveLength(1);
      expect(records[0]?.endedAt).toBe(endedAt ?? undefined);
      expect((fact.value as Record<string, unknown>).endedAt).toBe(endedAt);
    },
  );
  it.each([false, 42, '', 'invalid', '2026-10-09T07:00:00-03:00'])(
    'still rejects invalid persisted end %s',
    async (endedAt) => {
      await expect(
        setup([[source('bad', { endedAt })]]).repository.loadOwnHistory(
          'alice',
        ),
      ).rejects.toMatchObject({ code: 'resource-exhausted' });
    },
  );
  it('skips malformed tombstones before parsing and advances physical all-deleted pages', async () => {
    const mock = setup([
      Array.from({ length: 500 }, (_, i) =>
        source('deleted' + i, {
          deletedAt: false,
          startedAt: null,
          timeZone: null,
        }),
      ),
      [source('active')],
    ]);
    const result = await mock.repository.loadOwnHistory('alice');
    expect(result.records.map((r) => r.id)).toEqual(['active']);
    expect(mock.reads).toBe(2);
  });
  it('rejects empty/path UID and malformed project before any database read', async () => {
    const mock = setup([]);
    for (const uid of ['', 'alice/foreign', '.', '..', 'x'.repeat(129)])
      await expect(mock.repository.loadOwnHistory(uid)).rejects.toMatchObject({
        code: 'unauthenticated',
      });
    await expect(
      mock.repository.loadOwnHistory('alice', 'bad/path'),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(mock.recordQueries).toHaveLength(0);
    expect(mock.projectReads).toHaveLength(0);
    expect(mock.options).toBeUndefined();
  });
  it('loads all own pages in one read-only transaction, never collection group or UID in payload', async () => {
    const first = Array.from({ length: 500 }, (_, i) =>
      source('r' + i, { uid: 'untrusted' }),
    );
    const mock = setup([first, [source('last', { projectId: 'personal' })]], {
      a: {},
      personal: { type: 'personal', createdBy: 'alice' },
    });
    const result = await mock.repository.loadOwnHistory('alice');
    expect(result.records).toHaveLength(501);
    expect(result.records.every((r) => r.uid === 'alice')).toBe(true);
    expect(mock.recordQueries).toEqual(['users/alice/records']);
    expect(mock.nativeQueries.map((query) => query.cursor?.id)).toEqual([
      undefined,
      'r499',
    ]);
    expect(
      mock.nativeQueries.every((query) => query.orderBy[0] === '__name__'),
    ).toBe(true);
    expect(mock.options).toEqual({ readOnly: true });
    expect(mock.reads).toBe(2);
  });
  it('excludes foreign personal and malformed project type before parsing stale invalid dates', async () => {
    const mock = setup(
      [
        [
          source('ok'),
          source('foreign', {
            projectId: 'foreign',
            startedAt: 'not-a-date',
            timeZone: 'invalid',
          }),
          source('invalidtype', { projectId: 'invalidtype', endedAt: null }),
        ],
      ],
      {
        a: {},
        foreign: { type: 'personal', createdBy: 'bob' },
        invalidtype: { type: 123 },
      },
    );
    expect(
      (await mock.repository.loadOwnHistory('alice')).records.map((r) => r.id),
    ).toEqual(['ok']);
  });
  it('fails closed for invalid authorized sources and oversized complete history', async () => {
    await expect(
      setup([
        [source('broken', { startedAt: 'invalid' })],
      ]).repository.loadOwnHistory('alice'),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    const page = Array.from({ length: 500 }, (_, i) => source('r' + i));
    const mock = setup([page, page, page, page, [source('extra')]]);
    await expect(
      mock.repository.loadOwnHistory('alice', 'a'),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(mock.reads).toBe(5);
    expect(
      (
        await setup([page, page, page, page, []]).repository.loadOwnHistory(
          'alice',
        )
      ).records,
    ).toHaveLength(2000);
  });
  it('keeps the native full-history context separate from project/date selection', async () => {
    const facts = [
      source('spanning', {
        startedAt: '2026-10-01T00:00:00Z',
        endedAt: '2026-10-20T00:00:00Z',
      }),
      source('old-open', { startedAt: '2026-09-01T08:00:00Z' }),
      source('offset-east', {
        startedAt: '2026-10-10T16:00:00+14:00',
        endedAt: '2026-10-10T17:00:00+14:00',
      }),
      source('before', {
        startedAt: '2026-10-08T01:00:00Z',
        endedAt: '2026-10-09T02:59:00Z',
      }),
      source('future', { startedAt: '2026-11-01T09:00:00Z' }),
      source('other', { projectId: 'b' }),
    ];
    const mock = setup([facts], { a: {}, b: { archived: true } });
    const selection = daySelection(false);
    const context = await mock.repository.loadOwnHistory(
      'alice',
      'a',
      selection,
    );
    expect(context.records.map((record) => record.id)).toEqual(
      facts.map((fact) => fact.id),
    );
    expect(context.selectedRecords.map((record) => record.id)).toEqual([
      'old-open',
      'spanning',
      'offset-east',
    ]);
    expect(mock.nativeQueries).toHaveLength(2);
    expect(mock.nativeQueries[0]).toMatchObject({
      where: [],
      orderBy: ['__name__'],
      limit: 500,
    });
    expect(mock.nativeQueries[1]).toMatchObject({
      where: [
        ['projectId', '==', 'a'],
        ['startedAt', '<', '2026-10-12'],
      ],
      orderBy: ['startedAt', '__name__'],
      limit: 500,
    });
    expect(mock.options).toEqual({ readOnly: true });
    expect(mock.recordQueries).toEqual(['users/alice/records']);
  });
  it('selects archive/merge flags only in the repository without spending an estimation budget', async () => {
    const facts = [
      source('archived-fact', {
        projectId: 'b',
        startedAt: '2026-10-09T01:00:00-03:00',
        endedAt: '2026-10-09T13:00:00-03:00',
      }),
      source('merged-fact', {
        projectId: 'c',
        endedAt: '2026-10-09T09:00:00-03:00',
      }),
      source('open', { startedAt: '2026-10-09T14:00:00-03:00' }),
    ];
    const mock = setup([facts], {
      a: {},
      b: { archived: true },
      c: { mergedInto: 'a' },
    });
    const context = await mock.repository.loadOwnHistory(
      'alice',
      undefined,
      daySelection(false),
    );
    expect(context.records).toHaveLength(3);
    expect(context.selectedRecords.map((record) => record.id)).toEqual([
      'open',
    ]);
    const report = buildDailyHours(
      dailyHoursInput.parse({ date: '2026-10-09', includeArchived: false }),
      context,
      'alice',
      Date.parse('2026-10-09T23:00:00-03:00'),
    );
    expect(report).toMatchObject({
      totalMinutes: 360,
      estimatedMinutes: 360,
      closedMinutes: 0,
    });
    const archived = await setup([facts], {
      a: {},
      b: { archived: true },
      c: { mergedInto: 'a' },
    }).repository.loadOwnHistory('alice', 'b', daySelection(false));
    expect(archived.records).toHaveLength(3);
    expect(archived.selectedRecords).toEqual([]);
  });
  it('preserves same-project next starts and archived other-project facts before display filtering', async () => {
    const facts = [
      source('open', { startedAt: '2026-10-09T09:00:00-03:00' }),
      source('other-next', {
        projectId: 'b',
        startedAt: '2026-10-09T10:00:00-03:00',
        endedAt: '2026-10-09T20:00:00-03:00',
      }),
      source('next', {
        startedAt: '2026-10-09T11:00:00-03:00',
        endedAt: '2026-10-09T12:00:00-03:00',
      }),
    ];
    const context = await setup([facts], {
      a: {},
      b: { archived: true },
    }).repository.loadOwnHistory('alice', 'a', daySelection(false));
    expect(context.records.map((r) => r.id)).toEqual([
      'open',
      'other-next',
      'next',
    ]);
    expect(context.selectedRecords.map((r) => r.id)).toEqual(['open', 'next']);
    const report = buildDailyHours(
      dailyHoursInput.parse({
        date: '2026-10-09',
        projectId: 'a',
        includeArchived: false,
      }),
      context,
      'alice',
      Date.parse('2026-10-09T23:00:00-03:00'),
    );
    expect(report).toMatchObject({
      estimatedMinutes: 120,
      closedMinutes: 60,
      totalMinutes: 180,
    });
    expect(report.intervals[0]).toMatchObject({
      id: 'open',
      effectiveEndedAt: '2026-10-09T14:00:00.000Z',
    });
  });
  it('advances physical native selection cursors over all-residual pages', async () => {
    const rejected = Array.from({ length: 500 }, (_, i) =>
      source('expired-' + String(i).padStart(3, '0'), {
        startedAt: '2026-09-01T08:00:00Z',
        endedAt: '2026-09-01T09:00:00Z',
      }),
    );
    const mock = setup([rejected, [source('visible')]]);
    const context = await mock.repository.loadOwnHistory(
      'alice',
      'a',
      daySelection(),
    );
    expect(context.selectedRecords.map((record) => record.id)).toEqual([
      'visible',
    ]);
    const selections = mock.nativeQueries.filter(
      (query) => query.where.length > 0,
    );
    expect(selections).toHaveLength(2);
    expect(selections[1]?.cursor?.id).toBe('expired-499');
    expect(context.records).toHaveLength(501);
  });
  it('bounds physical pages separately from active authorized history', async () => {
    const deletedPage = Array.from({ length: 500 }, (_, i) =>
      source('deleted-' + i, {
        deletedAt: false,
        startedAt: null,
        timeZone: null,
      }),
    );
    const allowed = setup([
      ...Array<Document[]>(5).fill(deletedPage),
      [source('visible')],
    ]);
    expect(
      (await allowed.repository.loadOwnHistory('alice')).records.map(
        (r) => r.id,
      ),
    ).toEqual(['visible']);
    expect(allowed.reads).toBe(6);
    const oversized = setup([
      ...Array<Document[]>(20).fill(deletedPage),
      [source('overflow')],
    ]);
    await expect(
      oversized.repository.loadOwnHistory('alice', 'a', daySelection()),
    ).rejects.toMatchObject({
      code: 'resource-exhausted',
      message:
        'Histórico próprio excede o limite operacional de 10000 registros físicos. Nenhum total parcial foi retornado; contate suporte sem apagar histórico.',
    });
    expect(oversized.reads).toBe(21);
    expect(
      oversized.nativeQueries.every((query) => query.where.length === 0),
    ).toBe(true);
  });
  it('validates selection before any database read and fails closed for corrupt unselected global context', async () => {
    const mock = setup([]);
    for (const selection of [
      { ...daySelection(), endedAt: NaN },
      { ...daySelection(), startedAt: Infinity },
      { ...daySelection(), endedAt: daySelection().startedAt },
    ])
      await expect(
        mock.repository.loadOwnHistory('alice', undefined, selection),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mock.options).toBeUndefined();
    await expect(
      setup([[source('corrupt-other', { projectId: 'b', startedAt: 'bad' })]], {
        a: {},
        b: { archived: true },
      }).repository.loadOwnHistory('alice', 'a', daySelection(false)),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('uses generic not-found for missing or inaccessible requested project and does not read records', async () => {
    for (const projectId of ['missing', 'foreign', 'invalidtype']) {
      const mock = setup([], {
        foreign: { type: 'personal', createdBy: 'bob' },
        invalidtype: { type: false },
      });
      await expect(
        mock.repository.loadOwnHistory('alice', projectId),
      ).rejects.toMatchObject({
        code: 'not-found',
        message: 'Projeto não encontrado.',
      });
      expect(mock.recordQueries).toHaveLength(0);
    }
  });
});
