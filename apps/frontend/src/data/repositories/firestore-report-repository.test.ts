import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  nativeCache,
  project,
  row,
  state,
  type CacheDocument,
  type CacheQuery,
} from './firestore-report-fixture';
vi.mock(
  'firebase/firestore',
  async () =>
    (await import('./firestore-report-fixture')).nativeCache.firestore,
);
import {
  FirestoreReportRepository,
  recordPath,
} from './firestore-report-repository';
import { decodeReportProjectMetadata } from '@work-track/data/codecs/report-project-metadata';
import { executePersonalReport } from '@work-track/core/reports/application/get-personal-report';
import { executeCompanyReport } from '@work-track/core/reports/application/get-company-report';
import { executeCalendarReport } from '@work-track/core/reports/application/get-calendar-report';
import { buildPersonalReport } from '@work-track/core/reports/domain/build-personal-report';
import { buildCompanyReport } from '@work-track/core/reports/domain/build-company-report';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';

beforeEach(() => nativeCache.reset());
afterEach(() => {
  expect(nativeCache.onSnapshot).not.toHaveBeenCalled();
  expect(nativeCache.getDocs).not.toHaveBeenCalled();
  expect(nativeCache.getDocsFromServer).not.toHaveBeenCalled();
  expect(nativeCache.getDoc).not.toHaveBeenCalled();
  expect(nativeCache.callable).not.toHaveBeenCalled();
});
const range = { from: '2026-10-08T00:00:00Z', to: '2026-10-09T00:00:00Z' };
const asOf = Date.parse('2026-10-09T00:00:00Z');
const closed = { endedAt: '2026-10-08T13:00:00Z' };
function fixture(
  records: CacheDocument[],
  projects = [project()],
  viewer = 'alice',
) {
  nativeCache.seedWorkspace(state({ projects, records }));
  return new FirestoreReportRepository(
    nativeCache.db,
    viewer,
    new Map(
      projects.map((p) => [
        p.id,
        decodeReportProjectMetadata(p.data, 'authorized-web'),
      ]),
    ),
  );
}
const queries = () =>
  nativeCache.getDocsFromCache.mock.calls.map(([q]) => q as CacheQuery);
const recordQueries = () => queries().filter((q) => q.base !== 'projects');
const referenceRecord = (doc: CacheDocument): ReportSourceRecord =>
  ({
    ...doc.data,
    id: doc.path.split('/').at(-1),
    endedAt: doc.data.endedAt ?? undefined,
  }) as ReportSourceRecord;

it.each(['personal', 'company'] as const)(
  'two-project %s report selects natively while unselected archived facts still share global time',
  async (scope) => {
    const records = [
      row('selected-p', closed),
      row('selected-q', { ...closed, projectId: 'q' }),
      row('unselected-archived', { ...closed, projectId: 'r' }),
    ];
    const repo = fixture(records, [
      project(),
      project('q'),
      project('r', { archived: true }),
    ]);
    const input = {
      ...range,
      projectIds: ['p', 'q'],
      timeZone: 'UTC',
      includeArchived: false,
    };
    const result =
      scope === 'personal'
        ? await executePersonalReport(repo.own(), input, 'alice', asOf)
        : await executeCompanyReport(repo, input, asOf);
    expect(result.intervals.map((r) => r.id)).toEqual([
      'selected-p',
      'selected-q',
    ]);
    expect(result.totalMinutes).toBe(40);
    expect(result.byProject).toEqual([
      { projectId: 'p', minutes: 20 },
      { projectId: 'q', minutes: 20 },
    ]);
    expect(result).toMatchObject({
      scope: 'all-selected',
      page: { partial: false, nextCursor: null },
    });
    expect(result.warnings.some((w) => w.includes('sobrepostos'))).toBe(true);
    expect(
      recordQueries().some((q) =>
        q.constraints.some(
          (c) =>
            c.field === 'projectId' &&
            c.op === 'in' &&
            JSON.stringify(c.value) === JSON.stringify(['p', 'q']),
        ),
      ),
    ).toBe(true);
    expect((await repo.loadContext(['alice'])).map((r) => r.id)).toEqual([
      'selected-p',
      'selected-q',
      'unselected-archived',
    ]);
  },
);

it('fixture executes collection/group, owner/project, document names, in, ordering, range and limits before decoding', () => {
  const { firestore: f } = nativeCache;
  nativeCache.seed([
    row('b', closed),
    row('a', closed),
    row('a', closed, 'bob'),
    row('missing', { startedAt: undefined, endedAt: null }),
  ]);
  const own = nativeCache.evaluate(
    f.query(
      f.collection(nativeCache.db, 'users', 'alice', 'records'),
      f.where('__name__', 'in', ['a', 'b']),
      f.orderBy('__name__', 'desc'),
      f.limit(1),
    ) as CacheQuery,
  );
  expect(own.docs.map((d) => d.ref.path)).toEqual(['users/alice/records/b']);
  const group = nativeCache.evaluate(
    f.query(
      f.collectionGroup(nativeCache.db, 'records'),
      f.where('__name__', '>', 'users/alice/records/b'),
      f.where('uid', 'in', ['bob']),
      f.where('projectId', '==', 'p'),
      f.where('startedAt', '>=', '2026-10-08'),
      f.where('startedAt', '<', '2026-10-09'),
    ) as CacheQuery,
  );
  expect(group.docs.map((d) => d.ref.path)).toEqual(['users/bob/records/a']);
  expect(
    nativeCache
      .evaluate(
        f.query(
          f.collectionGroup(nativeCache.db, 'records'),
          f.where('endedAt', '==', null),
        ) as CacheQuery,
      )
      .docs.map((d) => d.id),
  ).toEqual(['missing']);
});
it('pushes project, owner/person, interval and local physical limits into native cache queries', async () => {
  const repo = fixture(
    [
      row('selected', closed),
      row('other-project', { ...closed, projectId: 'q' }),
      row('other-person', closed, 'bob'),
      row('outside', {
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: '2026-01-01T01:00:00Z',
      }),
    ],
    [project(), project('q')],
  );
  const page = await repo.readPage(100, undefined, 'p', {
    ...range,
    userIds: ['alice'],
  });
  expect(page.records.map((r) => r.id)).toEqual(['selected']);
  expect(queries()[0]).toMatchObject({
    base: 'projects',
    constraints: [
      { field: '__name__', op: 'in', value: ['p'] },
      { field: 'archived', op: '==', value: false },
    ],
  });
  expect(recordQueries()).toHaveLength(3);
  for (const q of recordQueries()) {
    expect(q.base).toEqual({ group: 'records' });
    expect(q.constraints).toContainEqual({
      field: 'projectId',
      op: 'in',
      value: ['p'],
    });
    expect(q.constraints).toContainEqual({
      field: 'uid',
      op: 'in',
      value: ['alice'],
    });
    expect(q.constraints).toContainEqual({ kind: 'limit', count: 2001 });
  }
  nativeCache.getDocsFromCache.mockClear();
  expect(
    (
      await repo
        .own()
        .readPage('alice', 100, undefined, { ...range, projectId: 'p' })
    ).records.map((r) => r.id),
  ).toEqual(['selected']);
  for (const q of recordQueries()) expect(q.base).toBe('users/alice/records');
});
it('batches project and person in predicates without dropping combinations or duplicate IDs', async () => {
  const projects = Array.from({ length: 31 }, (_, i) => project('p' + i));
  const people = ['alice', 'bob', 'carol', 'dave'];
  const records = projects.flatMap((p) =>
    people.map((uid) => row('same', { projectId: p.id, ...closed }, uid)),
  );
  // IDs are unique per owner's collection; qualify them per project in the fixture.
  for (const [index, r] of records.entries())
    r.path = r.path.replace('/same', '/' + index);
  const repo = fixture(records, projects);
  const page = await repo.readPage(200, undefined, undefined, {
    projectIds: projects.map((p) => p.id),
    userIds: people,
    includeArchived: true,
  });
  expect(page.records).toHaveLength(124);
  await expect(
    repo.readPage(200, undefined, 'p0', { projectIds: ['p0'] }),
  ).rejects.toThrow('Conflicting');
  expect(queries().filter((q) => q.base === 'projects')).toHaveLength(2);
  expect(recordQueries()).toHaveLength(13);
  for (const q of recordQueries()) {
    const projectIds = q.constraints.find((c) => c.field === 'projectId')!
      .value as string[];
    const users = q.constraints.find((c) => c.field === 'uid')!
      .value as string[];
    expect(projectIds.length * users.length).toBeLessThanOrEqual(10);
    expect(q.constraints).toContainEqual({
      kind: 'orderBy',
      field: '__name__',
      direction: 'asc',
    });
  }
});
it('resolves trusted factors at original starts for selected and full context, never from record payloads', async () => {
  const p = project();
  p.data.timeMultipliers = {
    alice: [
      { multiplier: 2, effectiveFrom: null },
      { multiplier: 3, effectiveFrom: '2026-10-08T12:30:00Z' },
    ],
  };
  const repo = fixture(
    [
      row('before', { ...closed, timeMultiplier: 999 }),
      row('after', {
        ...closed,
        startedAt: '2026-10-08T12:45:00Z',
        timeMultiplier: 999,
      }),
    ],
    [p],
  );
  const selected = await repo.readPage(100, undefined, undefined, {
    projectIds: ['p'],
    userIds: ['alice'],
    ...range,
  });
  expect(selected.records.map((r) => [r.id, r.timeMultiplier])).toEqual([
    ['after', 3],
    ['before', 2],
  ]);
  const context = await repo.loadContext(['alice']);
  expect(context.map((r) => [r.id, r.timeMultiplier])).toEqual([
    ['after', 3],
    ['before', 2],
  ]);
  // Crop after the new rule: original start12:00 still uses2, not3.
  const calendar = await executeCalendarReport(
    repo.calendar(),
    {
      mode: 'own',
      projectIds: ['p'],
      userIds: ['alice'],
      from: '2026-10-08T12:30:00Z',
      to: '2026-10-08T12:40:00Z',
      timeZone: 'UTC',
      includeArchived: false,
      allWeeks: false,
    },
    'alice',
    asOf,
  );
  expect(calendar.totalMinutes).toBe(20);
  expect(calendar.intervals[0].timeMultiplier).toBe(2);
});
it('calendar multiplies independently by person after selection and keeps full context trusted', async () => {
  const p = project();
  p.data.timeMultipliers = {
    alice: [{ multiplier: 1, effectiveFrom: null }],
    bob: [{ multiplier: 0.25, effectiveFrom: null }],
  };
  const repo = fixture(
    [
      row('senior', {
        startedAt: '2026-10-08T08:00:00Z',
        endedAt: '2026-10-08T09:00:00Z',
        timeMultiplier: 999,
      }),
      row(
        'junior',
        {
          startedAt: '2026-10-08T08:00:00Z',
          endedAt: '2026-10-08T12:00:00Z',
          timeMultiplier: 999,
        },
        'bob',
      ),
    ],
    [p],
  );
  const result = await executeCalendarReport(
    repo.calendar(),
    {
      mode: 'global',
      projectIds: ['p'],
      userIds: ['alice', 'bob'],
      ...range,
      timeZone: 'UTC',
      includeArchived: false,
      allWeeks: false,
    },
    'alice',
    asOf,
  );
  expect(result.totalMinutes).toBe(120);
  expect(result.byUser.map((u) => [u.uid, u.minutes])).toEqual([
    ['alice', 60],
    ['bob', 60],
  ]);
});
it('rejects missing storage lifecycle fields and queries live records natively', async () => {
  const repo = fixture([row('missing', { deletedAt: undefined }), row('null')]);
  expect((await repo.own().loadContext(['alice'])).map((r) => r.id)).toEqual([
    'null',
  ]);
  expect(
    recordQueries().every((q) =>
      q.constraints.some(
        (c) => c.field === 'deletedAt' && c.op === '==' && c.value === null,
      ),
    ),
  ).toBe(true);
  await expect(
    fixture([row('missing-end', { endedAt: undefined })])
      .own()
      .loadContext(['alice']),
  ).rejects.toThrow();
});
it('queries full-spanning closed intervals, explicit null opens and offset ISO boundary intersections exactly', async () => {
  const repo = fixture([
    row('spanning', {
      startedAt: '2026-09-01T00:00:00Z',
      endedAt: '2026-11-01T00:00:00Z',
    }),

    row('old-null', { startedAt: '2026-01-01T00:00:00Z', endedAt: null }),
    row('offset', {
      startedAt: '2026-10-07T23:30:00-03:00',
      endedAt: '2026-10-08T00:30:00-03:00',
    }),
    row('before', {
      startedAt: '2026-10-07T12:00:00Z',
      endedAt: '2026-10-07T13:00:00Z',
    }),
    row('after', {
      startedAt: '2026-10-09T00:00:00Z',
      endedAt: '2026-10-09T01:00:00Z',
    }),
  ]);
  expect(
    (await repo.own().readPage('alice', 100, undefined, range)).records.map(
      (r) => r.id,
    ),
  ).toEqual(['offset', 'old-null', 'spanning']);
  expect(recordQueries()).toHaveLength(3);
});
it('matches existing shared domain interval math, overlap sums, UTC-offset clipping and open 6h cap without daily cap', async () => {
  const records = [
    row('span', {
      startedAt: '2026-10-07T22:00:00-03:00',
      endedAt: '2026-10-08T02:00:00-03:00',
    }),
    row('long', {
      startedAt: '2026-10-08T09:00:00Z',
      endedAt: '2026-10-08T17:00:00Z',
    }),
    row('open', { startedAt: '2026-10-08T12:00:00Z', endedAt: null }),
    row('archived-budget', {
      projectId: 'q',
      startedAt: '2026-10-08T12:00:00Z',
      endedAt: '2026-10-08T20:00:00Z',
    }),
  ];
  const repo = fixture(records, [project(), project('q', { archived: true })]);
  const input = {
    ...range,
    projectId: 'p',
    timeZone: 'UTC',
    includeArchived: false,
  };
  const actual = await executePersonalReport(repo.own(), input, 'alice', asOf);
  const context = records.map(referenceRecord);
  const expected = buildPersonalReport(
    input,
    { records: context.slice(0, 3), scannedCount: 3, nextCursor: null },
    asOf,
    context,
  );
  expect(actual.intervals).toEqual(expected.intervals);
  expect(actual.totalMinutes).toBe(650);
  expect(actual.estimatedCount).toBe(1);
  expect(actual.page.partial).toBe(false);
  expect(actual.warnings.some((w) => w.includes('sobrepostos'))).toBe(true);
  expect((await repo.own().loadContext(['alice'])).map((r) => r.id)).toContain(
    'archived-budget',
  );
});
it('computes estimates from unselected same-project/topic history, and retains all archived projects in context', async () => {
  const topics = [
    { archived: false, id: 'x', title: 'X' },
    { archived: false, id: 'other', title: 'Other' },
  ];
  const repo = fixture(
    [
      row('open', { topics: [{ topicId: 'x' }] }),
      row('next', {
        startedAt: '2026-10-08T13:00:00Z',
        endedAt: '2026-10-08T14:00:00Z',
        topics: [{ topicId: 'other' }],
      }),
      row('archived', { ...closed, projectId: 'q' }),
    ],
    [project('p', { topics }), project('q', { archived: true })],
  );
  const result = await executeCalendarReport(
    repo.calendar(),
    {
      ...range,
      projectId: 'p',
      topicId: 'x',
      mode: 'own',
      timeZone: 'UTC',
      allWeeks: false,
      includeArchived: false,
    },
    'alice',
    asOf,
  );
  expect(result).toMatchObject({
    totalMinutes: 300,
    estimatedCount: 1,
    page: { partial: false },
  });
  expect(result.intervals.map((r) => r.id)).toEqual(['open']);
  expect((await repo.own().loadContext(['alice'])).map((r) => r.id)).toEqual([
    'archived',
    'next',
    'open',
  ]);
});
it('preserves company author-qualified math and never leaks another owner personal project', async () => {
  const records = [
    row('same', closed),
    row('same', { endedAt: '2026-10-08T14:00:00Z' }, 'bob'),
  ];
  const repo = fixture(
    [
      ...records,
      row('foreign', { projectId: 'private', ...closed }, 'bob'),
      row('own-private', { projectId: 'mine', ...closed }),
    ],
    [
      project(),
      project('private', { type: 'personal', createdBy: 'bob' }),
      project('mine', { type: 'personal', createdBy: 'alice' }),
    ],
  );
  const input = {
    ...range,
    projectId: 'p',
    timeZone: 'UTC',
    includeArchived: false,
  };
  const actual = await executeCompanyReport(repo, input, asOf);
  const context = records.map(referenceRecord);
  const expected = buildCompanyReport(
    input,
    { records: context, scannedCount: 2, nextCursor: null },
    context,
    asOf,
    { alice: 'Você', bob: 'bob' },
    [],
  );
  expect(actual.intervals).toEqual(expected.intervals);
  expect(actual.totalMinutes).toBe(180);
  expect((await repo.loadContext(['alice', 'bob'])).map(recordPath)).toEqual([
    'users/alice/records/same',
    'users/bob/records/same',
  ]);
  expect((await repo.own().loadContext(['alice'])).map((r) => r.id)).toEqual([
    'own-private',
    'same',
  ]);
  await expect(repo.own().loadContext(['bob'])).rejects.toThrow('Visualizador');
});
it('qualifies cursors by owner and pushes pagination through documentId predicates', async () => {
  const repo = fixture([
    row('same', closed),
    row('same', closed, 'bob'),
    row('z', closed),
  ]);
  const first = await repo.readPage(1);
  expect(first.nextCursor).toBe('users/alice/records/same');
  const second = await repo.readPage(2, first.nextCursor!);
  expect(second.records.map(recordPath)).toEqual([
    'users/alice/records/z',
    'users/bob/records/same',
  ]);
  expect(second.nextCursor).toBeNull();
  expect(recordQueries().at(-1)!.constraints).toContainEqual({
    field: '__name__',
    op: '>',
    value: 'users/alice/records/same',
  });
  const ownFirst = await repo.own().readPage('alice', 1);
  const ownSecond = await repo.own().readPage('alice', 1, ownFirst.nextCursor!);
  expect(ownSecond.records.map((r) => r.id)).toEqual(['z']);
  expect(recordQueries().at(-1)!.constraints).toContainEqual({
    field: '__name__',
    op: '>',
    value: 'same',
  });
});
it('queries active/archived existing parents but never narrows full-context estimate facts', async () => {
  const repo = fixture(
    [
      row('existing', closed),
      row('archived', { ...closed, projectId: 'a' }),
      row('merged', { ...closed, projectId: 'm' }),
    ],
    [
      project('p', { type: 'work', archived: false }),
      project('a', { archived: true }),
      project('m', { mergedInto: 'p' }),
    ],
  );
  expect(
    (await repo.own().readPage('alice', 100, undefined, {})).records.map(
      (r) => r.id,
    ),
  ).toEqual(['existing']);
  expect(
    (
      await repo
        .own()
        .readPage('alice', 100, undefined, { includeArchived: true })
    ).records,
  ).toHaveLength(3);
  expect(await repo.own().loadContext(['alice'])).toHaveLength(3);
  expect(await repo.archivedProjectIds(['p', 'a', 'm', 'gone'])).toEqual([
    'a',
    'm',
    'gone',
  ]);
});
it('revalidates deletion, owner, moves and current ACL rather than reviving stale query rows', async () => {
  const repo = fixture([row('selected', closed)]);
  const selected = (await repo.own().readPage('alice', 100)).records;
  const original = structuredClone(selected);
  nativeCache.seedWorkspace(
    state({
      projects: [project()],
      records: [row('selected', { ...closed, deletedAt: 'removed' })],
    }),
  );
  expect(await repo.revalidate(selected, 'alice', true)).toEqual([]);
  nativeCache.seedWorkspace(
    state({
      projects: [project('p', { type: 'personal', createdBy: 'bob' })],
      records: [row('selected', closed)],
    }),
  );
  expect(await repo.revalidate(selected, 'alice', true)).toEqual([]);
  expect(selected).toEqual(original);
  await expect(repo.revalidate(selected, 'bob', true)).rejects.toThrow(
    'Visualizador',
  );
});
it('rejects per-query and cross-batch context overflow instead of returning silent partial totals', async () => {
  const tooMany = Array.from({ length: 2001 }, (_, i) =>
    row(String(i).padStart(4, '0'), closed),
  );
  const repo = fixture(tooMany);
  await expect(repo.own().loadContext(['alice'])).rejects.toThrow('2000');
  expect(recordQueries()[0].constraints).toContainEqual({
    kind: 'limit',
    count: 2001,
  });
  const projects = Array.from({ length: 11 }, (_, i) => project('p' + i));
  const dispersed = projects.flatMap((p, n) =>
    Array.from({ length: 190 }, (_, i) =>
      row(n + '-' + i, { ...closed, projectId: p.id }),
    ),
  );
  const acrossBatches = fixture(dispersed, projects);
  await expect(acrossBatches.own().loadContext(['alice'])).rejects.toThrow(
    '2000',
  );
});
it('propagates missing native cache data and malformed selected schema without remote fallback', async () => {
  const repo = fixture([row('bad', { startedAt: 42 })]);
  await expect(repo.own().loadContext(['alice'])).rejects.toThrow();
  nativeCache.getDocsFromCache.mockRejectedValueOnce(
    new Error('IndexedDB unavailable'),
  );
  await expect(repo.readPage(100)).rejects.toThrow('IndexedDB unavailable');
});

it('uses Firestore lexical document-name ordering across punctuation and case, avoiding skipped cursor pages', async () => {
  const repo = fixture(['a', '_', 'A', 'z', '-'].map((id) => row(id, closed)));
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await repo.own().readPage('alice', 1, cursor);
    ids.push(...page.records.map((r) => r.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(ids).toEqual(['-', 'A', '_', 'a', 'z']);
});
it('revalidates equivalent decoded values regardless of object insertion order', async () => {
  const repo = fixture([row('selected', closed)]);
  const selected = (await repo.readPage(100)).records;
  const reordered = selected.map(
    (r) =>
      Object.fromEntries(Object.entries(r).reverse()) as ReportSourceRecord,
  );
  expect(await repo.revalidate(reordered, 'alice', false)).toEqual(reordered);
});

it('selects one-sided period bounds and pushes upper candidates into the cache', async () => {
  const repo = fixture([
    row('before', {
      startedAt: '2026-09-01T00:00:00Z',
      endedAt: '2026-09-01T01:00:00Z',
    }),
    row('inside', closed),
    row('future', {
      startedAt: '2026-11-01T00:00:00Z',
      endedAt: '2026-11-01T01:00:00Z',
    }),
  ]);
  expect(
    (
      await repo.own().readPage('alice', 100, undefined, {
        from: range.from,
        includeArchived: true,
      })
    ).records.map((r) => r.id),
  ).toEqual(['future', 'inside']);
  nativeCache.getDocsFromCache.mockClear();
  expect(
    (
      await repo.own().readPage('alice', 100, undefined, {
        to: range.to,
        includeArchived: true,
      })
    ).records.map((r) => r.id),
  ).toEqual(['before', 'inside']);
  expect(recordQueries()[0].constraints).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: 'startedAt', op: '<' }),
    ]),
  );
});
it('preserves Firestore owner segment ordering across UID prefixes during company pagination', async () => {
  const repo = fixture([row('z', closed, 'u'), row('a', closed, 'u-')]);
  const first = await repo.readPage(1);
  expect(first.records[0].uid).toBe('u');
  const second = await repo.readPage(1, first.nextCursor ?? undefined);
  expect(second.records[0].uid).toBe('u-');
});

it('rejects invalid topic weights consistently in all web report modes', async () => {
  const repo = fixture([
    row('invalid', { ...closed, topics: [{ topicId: 'x', percentage: -1 }] }),
  ]);
  await expect(repo.own().readPage('alice', 100)).rejects.toThrow();
  await expect(repo.calendar().own.readPage('alice', 100)).rejects.toThrow();
  await expect(
    repo.project().readPage('p', 100, undefined, 'alice'),
  ).rejects.toThrow();
});
it('matches native UTF8 owner path ordering for BMP and supplementary Unicode cursor pages', async () => {
  const repo = fixture([row('a', closed, '😀'), row('a', closed, '\uE000')]);
  const first = await repo.readPage(1);
  expect(first.records[0].uid).toBe('\uE000');
  const second = await repo.readPage(1, first.nextCursor ?? undefined);
  expect(second.records[0].uid).toBe('😀');
});

it('revalidates exact selected names without combining participant lifetime context into one physical cap', async () => {
  const history = ['alice', 'bob', 'charlie'].flatMap((uid) =>
    Array.from({ length: 1000 }, (_, i) =>
      row(
        'r' + i,
        { startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T01:00:00Z' },
        uid,
      ),
    ),
  );
  const repo = fixture(history);
  const selected = history
    .filter((r) => r.path.endsWith('/r999'))
    .map(referenceRecord);
  const valid = await repo.calendar().revalidate(selected, 'alice', 'global');
  expect(valid).toHaveLength(3);
  expect(recordQueries()).toHaveLength(1);
  expect(recordQueries()[0].constraints).toContainEqual({
    field: '__name__',
    op: 'in',
    value: selected.map((r) => 'users/' + r.uid + '/records/' + r.id),
  });
});

it('keeps period physical budget per participant even with thousands of historical closed candidates', async () => {
  const users = ['alice', 'bob', 'charlie'];
  const history = users.flatMap((uid) =>
    Array.from({ length: 1000 }, (_, i) =>
      row(
        'old' + i,
        { startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T01:00:00Z' },
        uid,
      ),
    ),
  );
  const repo = fixture([
    ...history,
    ...users.map((uid) => row('today', closed, uid)),
  ]);
  const page = await repo.readPage(100, undefined, undefined, {
    ...range,
    userIds: users,
    includeArchived: true,
  });
  expect(page.records).toHaveLength(3);
});
it('rejects duplicated topic IDs as ambiguous instead of silently using the last metadata row', async () => {
  const repo = fixture(
    [row('a', { ...closed, topics: [{ topicId: 'x', percentage: 100 }] })],
    [
      project('p', {
        topics: [
          { archived: false, id: 'x', title: 'X' },
          { archived: false, id: 'x', title: 'Other' },
        ],
      }),
    ],
  );
  await expect(
    repo.readPage(100, undefined, 'p', { topicId: 'x', includeArchived: true }),
  ).rejects.toThrow('Identidade de tópico inválida');
});

it.each(['personal', 'company'] as const)(
  'reads a 1000-record complete %s selection once instead of rereading 5500 native documents',
  async (scope) => {
    const repo = fixture(
      Array.from({ length: 1000 }, (_, i) =>
        row(String(i).padStart(4, '0'), closed),
      ),
    );
    const own = repo.own();
    const selection = { to: range.to, includeArchived: true };
    const nativeRecordCount = async () => {
      let count = 0;
      for (let i = 0; i < nativeCache.getDocsFromCache.mock.calls.length; i++) {
        const [q] = nativeCache.getDocsFromCache.mock.calls[i];
        if ((q as CacheQuery).base !== 'projects')
          count += (await nativeCache.getDocsFromCache.mock.results[i].value)
            .size;
      }
      return count;
    };
    const complete =
      scope === 'personal'
        ? await own.readCompleteSelection!('alice', selection)
        : await repo.readCompleteSelection(selection);
    expect(complete).toMatchObject({ scannedCount: 1000, nextCursor: null });
    expect(recordQueries()).toHaveLength(1);
    expect(await nativeRecordCount()).toBe(1000);
    nativeCache.getDocsFromCache.mockClear();
    const legacy: ReportSourceRecord[] = [];
    let cursor: string | undefined;
    do {
      const page =
        scope === 'personal'
          ? await own.readPage('alice', 100, cursor, selection)
          : await repo.readPage(100, cursor, undefined, selection);
      legacy.push(...page.records);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(recordQueries()).toHaveLength(10);
    expect(await nativeRecordCount()).toBe(5500);
    expect(complete.records).toEqual(legacy);
    const input = { ...range, timeZone: 'UTC', includeArchived: true };
    expect(
      buildPersonalReport(input, complete, asOf, complete.records),
    ).toEqual(
      buildPersonalReport(
        input,
        {
          records: legacy,
          scannedCount: legacy.length,
          nextCursor: null,
        },
        asOf,
        legacy,
      ),
    );
  },
);

it.each(['personal', 'company'] as const)(
  'rejects complete %s overflow both per native query and across project shards',
  async (scope) => {
    const read = (repo: FirestoreReportRepository) =>
      scope === 'personal'
        ? repo.own().readCompleteSelection!('alice')
        : repo.readCompleteSelection();
    await expect(
      read(
        fixture(Array.from({ length: 2001 }, (_, i) => row(String(i), closed))),
      ),
    ).rejects.toThrow('2000');
    const projects = Array.from({ length: 11 }, (_, i) => project('p' + i));
    const records = projects.flatMap((p, n) =>
      Array.from({ length: 190 }, (_, i) =>
        row(n + '-' + i, { ...closed, projectId: p.id }),
      ),
    );
    await expect(read(fixture(records, projects))).rejects.toThrow('2000');
  },
);

it.each(['personal', 'company'] as const)(
  'keeps complete %s selections fresh after record edits, deletion and ACL revocation',
  async (scope) => {
    const repo = fixture([row('selected', closed)]);
    const own = repo.own();
    const read = () =>
      scope === 'personal'
        ? own.readCompleteSelection!('alice')
        : repo.readCompleteSelection();
    const first = await read();
    nativeCache.seedWorkspace(
      state({
        projects: [project()],
        records: [
          row('selected', {
            endedAt: '2026-10-08T14:00:00Z',
          }),
        ],
      }),
    );
    expect((await read()).records[0].endedAt).toBe('2026-10-08T14:00:00Z');
    expect(
      await repo.revalidate(first.records, 'alice', scope === 'personal'),
    ).toEqual([]);
    nativeCache.seedWorkspace(
      state({
        projects: [project()],
        records: [
          row('selected', {
            ...closed,
            deletedAt: 'removed',
          }),
        ],
      }),
    );
    expect((await read()).records).toEqual([]);
    nativeCache.seedWorkspace(
      state({
        projects: [
          project('p', {
            type: 'personal',
            createdBy: 'bob',
          }),
        ],
        records: [row('selected', closed)],
      }),
    );
    expect((await read()).records).toEqual([]);
    await expect(own.readCompleteSelection!('bob')).rejects.toThrow(
      'Visualizador',
    );
  },
);

it('retains native project, person, range and residual topic selection in complete reads', async () => {
  const repo = fixture(
    [
      row('match', { ...closed, topics: [{ topicId: 'x' }] }),
      row('wrong-topic', closed),
      row('wrong-owner', { ...closed, topics: [{ topicId: 'x' }] }, 'bob'),
      row('wrong-project', {
        ...closed,
        projectId: 'q',
        topics: [{ topicId: 'x' }],
      }),
      row('outside', {
        startedAt: '2026-11-01T12:00:00Z',
        endedAt: '2026-11-01T13:00:00Z',
      }),
    ],
    [
      project('p', { topics: [{ archived: false, id: 'x', title: 'X' }] }),
      project('q'),
    ],
  );
  const selection = {
    ...range,
    projectId: 'p',
    userIds: ['alice'],
    topicId: 'x',
    includeArchived: true,
  };
  const company = await repo.readCompleteSelection(selection);
  const personal = await repo.own().readCompleteSelection!('alice', selection);
  expect(company.records.map((r) => r.id)).toEqual(['match']);
  expect(personal.records.map((r) => r.id)).toEqual(['match']);
  for (const q of recordQueries()) {
    expect(q.constraints).toEqual(
      expect.arrayContaining([
        { field: 'projectId', op: 'in', value: ['p'] },
        { field: 'deletedAt', op: '==', value: null },
        expect.objectContaining({ field: 'startedAt', op: '<' }),
      ]),
    );
    expect(q.constraints).not.toContainEqual(
      expect.objectContaining({ field: '__name__', op: '>' }),
    );
  }
  expect(recordQueries()[0].constraints).toContainEqual({
    field: 'uid',
    op: 'in',
    value: ['alice'],
  });
});
