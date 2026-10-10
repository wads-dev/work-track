import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreDailyHoursRepository } from './firestore-daily-hours.js';
import { type DailyProject } from '../domain/daily-hours.js';
function setup(
  pages: { id: string; value: Record<string, unknown> }[][],
  projects: Record<string, DailyProject> = { a: {} },
) {
  let reads = 0;
  const recordQueries: string[] = [],
    projectReads: string[] = [];
  let options: unknown;
  const query = {
    startAfter: (_id: string) => query,
    limit: (_n: number) => query,
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => {
        if (name === 'projects') return { id };
        recordQueries.push(name + '/' + id + '/records');
        return { collection: (_sub: string) => ({ orderBy: () => query }) };
      },
    }),
    runTransaction: <T>(work: (tx: unknown) => Promise<T>, opts: unknown) => {
      options = opts;
      return work({
        get: () =>
          Promise.resolve({
            docs: (pages[reads++] ?? []).map((doc) => ({
              id: doc.id,
              data: () => doc.value,
            })),
          }),
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
    expect(mock.recordQueries).toEqual([
      'users/alice/records',
      'users/alice/records',
    ]);
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
