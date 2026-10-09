import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { FirestoreCompanyReportRepository } from './firestore-company-report.js';
import { FirestorePersonalReportRepository } from './firestore-personal-report.js';
import { FirestoreProjectReportRepository } from './firestore-project-report.js';
import { getCompanyReportHandler } from '../presentation/get-company-report.js';
import {
  getProjectReportHandler,
  type ReportAuth,
} from '../presentation/get-project-report.js';

const UIDS = ['alice', 'bob'] as const;
const AS_OF = Date.parse('2026-10-08T20:00:00Z');
type Data = Record<string, unknown>;
type Ref = { id: string; path: string };
type RecordDoc = { id: string; ref: Ref; data: () => Data };
type Filter = { field: string; operator: string; value: unknown };
type QueryState = {
  uid?: string;
  filters: Filter[];
  after?: string;
  maximum?: number;
};
type Query = {
  state: QueryState;
  where: (field: string, operator: string, value: unknown) => Query;
  orderBy: (field: unknown) => Query;
  startAfter: (cursor: string | Ref) => Query;
  limit: (maximum: number) => Query;
  get: () => Promise<{ docs: RecordDoc[] }>;
};

function authFor(uid: string): ReportAuth {
  return {
    uid,
    token: {
      email: uid + '@wads.dev',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    },
  };
}

function record(uid: string, id: string, projectId: string, patch: Data = {}) {
  const path = 'users/' + uid + '/records/' + id;
  return {
    id,
    ref: { id, path },
    data: vi.fn(() => ({
      uid,
      projectId,
      startedAt: '2026-10-08T13:00:00Z',
      endedAt: '2026-10-08T14:00:00Z',
      timeZone: 'UTC',
      topics: [{ topicId: 'general', percentage: 100 }],
      originalText: 'PRIVATE_TRANSCRIPT',
      interpretation: 'PRIVATE_INTERPRETATION',
      ...patch,
    })),
  };
}

function metadata() {
  return new Map<string, Data>([
    ['work', { type: 'work', topics: [{ id: 'general', title: 'Geral' }] }],
    ['legacy', { createdBy: 'bob' }],
    ['alice-private', { type: 'personal', createdBy: 'alice' }],
    ['bob-private', { type: 'personal', createdBy: 'bob' }],
    ['invalid', { type: 'unrecognized', createdBy: 'alice' }],
    ['invalid-shape', { type: null, createdBy: 'alice' }],
    ['ownerless', { type: 'personal' }],
  ]);
}

// Only SDK boundaries are mocked: all repositories, access checks, parsers,
// pagination, context loading, and report/estimate builders execute real code.
function sdk(records: RecordDoc[], projects = metadata()) {
  const reads: QueryState[] = [];
  const snapshot = (query: Query) => {
    const { uid, filters, after, maximum } = query.state;
    reads.push(query.state);
    const key = (doc: RecordDoc) => (uid ? doc.id : doc.ref.path);
    const docs = records
      .filter(
        (doc) => !uid || doc.ref.path.startsWith('users/' + uid + '/records/'),
      )
      .filter((doc) =>
        filters.every(({ field, operator, value }) => {
          if (operator !== '==')
            throw new Error('Unsupported mock query operator');
          return doc.data()[field] === value;
        }),
      )
      .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
      .filter((doc) => !after || key(doc) > after)
      .slice(0, maximum);
    return { docs };
  };
  const queryGet = vi.fn((query: Query) => Promise.resolve(snapshot(query)));
  const transactionGet = vi.fn((query: Query) =>
    Promise.resolve(snapshot(query)),
  );
  const where =
    vi.fn<(field: string, operator: string, value: unknown) => void>();
  const makeQuery = (state: QueryState): Query => ({
    state,
    where: (field, operator, value) => {
      where(field, operator, value);
      return makeQuery({
        ...state,
        filters: [...state.filters, { field, operator, value }],
      });
    },
    orderBy: () => makeQuery(state),
    startAfter: (cursor) =>
      makeQuery({
        ...state,
        after: typeof cursor === 'string' ? cursor : cursor.path,
      }),
    limit: (maximum) => makeQuery({ ...state, maximum }),
    get: () => queryGet(makeQuery(state)),
  });
  const projectSnapshot = (id: string) => ({
    id,
    exists: projects.has(id),
    data: () => projects.get(id),
  });
  const projectGet = vi.fn((id: string) =>
    Promise.resolve(projectSnapshot(id)),
  );
  const userDoc = vi.fn((uid: string) => ({
    collection: (name: string) => {
      if (name !== 'records') throw new Error('Unexpected user collection');
      return makeQuery({ uid, filters: [] });
    },
  }));
  const collection = vi.fn((name: string) => {
    if (name === 'users') return { doc: userDoc };
    if (name !== 'projects') throw new Error('Unexpected root collection');
    return {
      doc: (id: string) => ({
        id,
        path: 'projects/' + id,
        get: () => projectGet(id),
      }),
    };
  });
  const getAll = vi.fn((...refs: Ref[]) =>
    Promise.resolve(refs.map((ref) => projectSnapshot(ref.id))),
  );
  const collectionGroup = vi.fn((name: string) => {
    if (name !== 'records') throw new Error('Unexpected collection group');
    return makeQuery({ filters: [] });
  });
  const runTransaction = vi.fn(
    (
      work: (tx: { get: typeof transactionGet }) => Promise<unknown>,
      options: { readOnly: boolean },
    ) => {
      expect(options).toEqual({ readOnly: true });
      return work({ get: transactionGet });
    },
  );
  const getUsers = vi.fn((users: { uid: string }[]) =>
    Promise.resolve({
      users: users.map(({ uid }) => ({
        uid,
        displayName: uid === 'alice' ? 'Alice' : 'Bob',
        email: uid + '@wads.dev',
      })),
    }),
  );
  return {
    db: {
      collection,
      collectionGroup,
      getAll,
      runTransaction,
      doc: (path: string) => ({ id: path.split('/').at(-1)!, path }),
    } as unknown as Firestore,
    auth: { getUsers } as unknown as Auth,
    projects,
    reads,
    where,
    getAll,
    projectGet,
    userDoc,
    collectionGroup,
    queryGet,
    transactionGet,
    runTransaction,
    getUsers,
  };
}

function expectNoTranscripts(value: unknown) {
  const output = JSON.stringify(value);
  expect(output).not.toContain('PRIVATE_TRANSCRIPT');
  expect(output).not.toContain('PRIVATE_INTERPRETATION');
  expect(output).not.toContain('@wads.dev');
}

const HIDDEN_PROJECTS = [
  'alice-private',
  'bob-private',
  'invalid',
  'invalid-shape',
  'ownerless',
  'missing',
] as const;

describe('company reports use only current work-project metadata', () => {
  it('all report adapters discard malformed tombstones before parsing and retain physical cursors', async () => {
    const rows = [
      record('alice', 'a-deleted', 'work', {
        deletedAt: false,
        startedAt: null,
        endedAt: 42,
        timeZone: null,
        topics: 'bad',
      }),
      record('alice', 'b-deleted', 'work', { deletedAt: 0, startedAt: null }),
      record('alice', 'z-active', 'work'),
    ];
    const mock = sdk(rows),
      company = new FirestoreCompanyReportRepository(mock.db, mock.auth),
      personal = new FirestorePersonalReportRepository(mock.db),
      project = new FirestoreProjectReportRepository(mock.db, mock.auth);
    const cp = await company.readPage(1);
    expect(cp.records).toEqual([]);
    expect(cp.nextCursor).toBeTruthy();
    expect(
      (await company.readPage(10, cp.nextCursor!)).records.map((r) => r.id),
    ).toEqual(['z-active']);
    const pp = await personal.readPage('alice', 1);
    expect(pp.records).toEqual([]);
    expect(pp.nextCursor).toBeTruthy();
    expect(
      (await personal.readPage('alice', 10, pp.nextCursor!)).records.map(
        (r) => r.id,
      ),
    ).toEqual(['z-active']);
    const pr = await project.readPage('work', 1, undefined, 'alice');
    if (!pr) throw new Error('expected accessible work project');
    expect(pr.records).toEqual([]);
    expect(pr.nextCursor).toBeTruthy();
    expect(
      (await project.readPage(
        'work',
        10,
        pr.nextCursor!,
        'alice',
      ))!.records.map((r) => r.id),
    ).toEqual(['z-active']);
    expect((await company.loadContext(['alice'])).map((r) => r.id)).toEqual([
      'z-active',
    ]);
    expect((await personal.loadContext(['alice'])).map((r) => r.id)).toEqual([
      'z-active',
    ]);
  });
  it('excludes all personal projects, including both owners, before counting', async () => {
    const rows = UIDS.flatMap((uid) => [
      record(uid, 'a-work', 'work'),
      record(uid, 'b-legacy', 'legacy'),
      ...HIDDEN_PROJECTS.map((id) => record(uid, 'hidden-' + id, id)),
    ]);
    const mock = sdk(rows);
    const repo = new FirestoreCompanyReportRepository(mock.db, mock.auth);
    const page = await repo.readPage(100);
    expect(page.scannedCount).toBe(4);
    expect(page.nextCursor).toBeNull();
    expect(page.records.map((r) => [r.uid, r.projectId])).toEqual([
      ['alice', 'work'],
      ['alice', 'legacy'],
      ['bob', 'work'],
      ['bob', 'legacy'],
    ]);
    expect(mock.collectionGroup).toHaveBeenCalledExactlyOnceWith('records');
    expect(mock.getAll).toHaveBeenCalled();
    expect(mock.reads[0]?.maximum).toBe(101);
    expectNoTranscripts(page);
  });

  it.each(HIDDEN_PROJECTS)(
    'ignores malformed records for hidden %s before parsing',
    async (id) => {
      const mock = sdk([
        record('alice', 'visible', 'work'),
        ...UIDS.map((uid) =>
          record(uid, 'poison', id, {
            uid: 'wrong-owner',
            startedAt: null,
            endedAt: 42,
            timeZone: null,
            topics: 'malformed',
          }),
        ),
      ]);
      const repo = new FirestoreCompanyReportRepository(mock.db, mock.auth);
      await expect(repo.readPage(100)).resolves.toMatchObject({
        records: [{ id: 'visible', uid: 'alice', projectId: 'work' }],
        scannedCount: 1,
        nextCursor: null,
      });
      await expect(repo.loadContext([...UIDS])).resolves.toMatchObject([
        { id: 'visible', uid: 'alice', projectId: 'work' },
      ]);
    },
  );

  it('rechecks getAll metadata instead of trusting stale record access fields', async () => {
    const mock = sdk([
      record('alice', 'stale', 'work', {
        type: 'work',
        createdBy: 'alice',
      }),
    ]);
    const repo = new FirestoreCompanyReportRepository(mock.db, mock.auth);
    expect((await repo.readPage(100)).scannedCount).toBe(1);
    mock.projects.set('work', { type: 'personal', createdBy: 'alice' });
    await expect(repo.readPage(100)).resolves.toMatchObject({
      records: [],
      scannedCount: 0,
    });
    await expect(repo.loadContext(['alice'])).resolves.toEqual([]);
    expect(mock.getAll.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it.each(UIDS)(
    'filters over 2000 private records for %s before validation and context limits',
    async (uid) => {
      const hidden = Array.from({ length: 2001 }, (_, i) =>
        record(
          uid,
          'a-' + String(i).padStart(4, '0'),
          HIDDEN_PROJECTS[i % HIDDEN_PROJECTS.length]!,
          {
            startedAt: null,
            topics: [{ topicId: 'secret', durationMinutes: -1 }],
          },
        ),
      );
      const mock = sdk([...hidden, record(uid, 'z-work', 'work')]);
      const repo = new FirestoreCompanyReportRepository(mock.db, mock.auth);
      await expect(repo.loadContext([uid])).resolves.toMatchObject([
        { id: 'z-work', uid, projectId: 'work' },
      ]);
      expect(mock.runTransaction).toHaveBeenCalledTimes(1);
      expect(mock.transactionGet).toHaveBeenCalledTimes(4);
      expect(
        mock.reads.every((read) => read.maximum === 501 && read.uid === uid),
      ).toBe(true);
      expect(mock.reads.map((read) => read.after)).toEqual([
        undefined,
        'a-0500',
        'a-1001',
        'a-1502',
      ]);
    },
  );

  it('still rejects invalid or oversized visible work context', async () => {
    const invalid = sdk([record('alice', 'bad', 'work', { startedAt: null })]);
    await expect(
      new FirestoreCompanyReportRepository(
        invalid.db,
        invalid.auth,
      ).loadContext(['alice']),
    ).rejects.toThrow('inválido');
    const oversized = sdk(
      Array.from({ length: 2001 }, (_, i) =>
        record('bob', String(i).padStart(4, '0'), 'work'),
      ),
    );
    await expect(
      new FirestoreCompanyReportRepository(
        oversized.db,
        oversized.auth,
      ).loadContext(['bob']),
    ).rejects.toThrow('Limite operacional');
    expect(oversized.transactionGet).toHaveBeenCalledTimes(4);
  });

  it('private closed facts, next starts and invalid dates cannot change company work estimates or totals', async () => {
    const work = [
      record('alice', 'open-work', 'work', { endedAt: undefined }),
      record('bob', 'closed-work', 'work'),
    ];
    const hidden = UIDS.flatMap((uid) => [
      record(uid, 'private-fact', uid + '-private', {
        startedAt: '2026-10-08T06:00:00Z',
        endedAt: '2026-10-08T14:00:00Z',
      }),
      record(uid, 'private-next', uid + '-private', {
        startedAt: '2026-10-08T13:30:00Z',
        endedAt: undefined,
      }),
      record(uid, 'private-invalid-date', uid + '-private', {
        startedAt: 'not-a-date',
        endedAt: 'also-not-a-date',
      }),
    ]);
    const clean = sdk(work);
    const contaminated = sdk([...work, ...hidden]);
    const baseline = await getCompanyReportHandler(
      new FirestoreCompanyReportRepository(clean.db, clean.auth),
      { timeZone: 'UTC', includeArchived: true },
      authFor('alice'),
      AS_OF,
    );
    const result = await getCompanyReportHandler(
      new FirestoreCompanyReportRepository(contaminated.db, contaminated.auth),
      { timeZone: 'UTC', includeArchived: true },
      authFor('bob'),
      AS_OF,
    );
    expect(result).toEqual(baseline);
    expect(result).toMatchObject({ totalMinutes: 300, estimatedCount: 1 });
    expect(result.intervals.find((r) => r.uid === 'alice')).toMatchObject({
      minutes: 240,
      effectiveEndedAt: '2026-10-08T17:00:00.000Z',
    });
    expect(result.page.scannedCount).toBe(2);
    expect(result.byUser.map((r) => r.uid)).toEqual([...UIDS]);
    expect(JSON.stringify(result)).not.toContain('private-');
    expectNoTranscripts(result);
  });
});

describe('personal report reads are owner-path and current-metadata scoped', () => {
  it.each(UIDS)(
    'returns only %s own records and accessible projects, including legacy work',
    async (uid) => {
      const other = uid === 'alice' ? 'bob' : 'alice';
      const mock = sdk([
        record(uid, 'a-work', 'work', { uid: other }),
        record(uid, 'b-own', uid + '-private'),
        record(uid, 'c-legacy', 'legacy'),
        record(uid, 'd-stale', other + '-private', {
          startedAt: null,
          topics: 'poison',
        }),
        record(uid, 'e-invalid', 'invalid', { startedAt: null }),
        record(uid, 'f-missing', 'missing', { startedAt: null }),
        record(other, 'other-work', 'work'),
        record(other, 'other-personal', other + '-private'),
      ]);
      const repo = new FirestorePersonalReportRepository(mock.db);
      const page = await repo.readPage(uid, 50);
      expect(page.records.map((r) => [r.id, r.uid])).toEqual([
        ['a-work', uid],
        ['b-own', uid],
        ['c-legacy', uid],
      ]);
      expect(page).toMatchObject({ scannedCount: 3, nextCursor: null });
      expect(mock.userDoc).toHaveBeenCalledExactlyOnceWith(uid);
      expect(mock.collectionGroup).not.toHaveBeenCalled();
      expect(mock.reads).toMatchObject([{ uid, maximum: 51 }]);
      await expect(repo.loadContext([uid])).resolves.toMatchObject(
        page.records,
      );
      expect(mock.reads.every((read) => read.uid === uid)).toBe(true);
      expectNoTranscripts(page);
    },
  );

  it('does not expose a stale own record after its project becomes third-party private', async () => {
    const mock = sdk([record('alice', 'stale', 'work')]);
    const repo = new FirestorePersonalReportRepository(mock.db);
    expect((await repo.readPage('alice', 50)).records).toHaveLength(1);
    mock.projects.set('work', { type: 'personal', createdBy: 'bob' });
    await expect(repo.readPage('alice', 50)).resolves.toMatchObject({
      records: [],
      scannedCount: 0,
    });
    await expect(repo.loadContext(['alice'])).resolves.toEqual([]);
  });
});

describe('project report authorization precedes any data or topic disclosure', () => {
  it.each([
    ['third-party private', { type: 'personal', createdBy: 'alice' }, 'bob'],
    [
      'third-party private reverse',
      { type: 'personal', createdBy: 'bob' },
      'alice',
    ],
    ['unknown type', { type: 'unknown', createdBy: 'alice' }, 'alice'],
    ['invalid type shape', { type: null, createdBy: 'bob' }, 'bob'],
    ['ownerless personal', { type: 'personal' }, 'alice'],
    ['invalid personal owner', { type: 'personal', createdBy: 42 }, 'bob'],
    ['missing', undefined, 'alice'],
  ] as const)(
    'returns generic not-found for %s before records/topics/labels',
    async (_name, access, viewer) => {
      const topics = vi.fn(() => {
        throw new Error('PRIVATE_TOPIC_MUST_NOT_BE_READ');
      });
      const projects = new Map<string, Data>();
      if (access)
        projects.set('target', {
          ...access,
          get topics() {
            return topics();
          },
        });
      const mock = sdk([record('alice', 'private-record', 'target')], projects);
      const repo = new FirestoreProjectReportRepository(mock.db, mock.auth);
      await expect(
        repo.readPage('target', 20, undefined, viewer),
      ).resolves.toBeNull();
      await expect(
        getProjectReportHandler(
          repo,
          { projectId: 'target' },
          authFor(viewer),
          AS_OF,
        ),
      ).rejects.toMatchObject({
        code: 'not-found',
        message: 'Projeto não encontrado.',
      });
      expect(topics).not.toHaveBeenCalled();
      expect(mock.collectionGroup).not.toHaveBeenCalled();
      expect(mock.queryGet).not.toHaveBeenCalled();
      expect(mock.getAll).not.toHaveBeenCalled();
      expect(mock.runTransaction).not.toHaveBeenCalled();
      expect(mock.getUsers).not.toHaveBeenCalled();
    },
  );

  it.each(UIDS)(
    'allows private owner %s but excludes other UID records',
    async (uid) => {
      const other = uid === 'alice' ? 'bob' : 'alice';
      const projects = metadata();
      projects.set('target', {
        type: 'personal',
        createdBy: uid,
        topics: [{ id: 'general', title: 'Owner topic' }],
      });
      const mock = sdk(
        [
          record(uid, 'a-own', 'target'),
          record(other, 'b-stale-other', 'target'),
        ],
        projects,
      );
      const repo = new FirestoreProjectReportRepository(mock.db, mock.auth);
      const page = await repo.readPage('target', 20, undefined, uid);
      expect(page).toMatchObject({
        personal: true,
        records: [{ uid, id: 'a-own' }],
        topicLabels: { general: 'Owner topic' },
        nextCursor: null,
      });
      expect(page?.records).toHaveLength(1);
      expect(mock.where).toHaveBeenCalledWith('projectId', '==', 'target');
      expectNoTranscripts(page);
    },
  );

  it.each(UIDS)(
    'forwards authenticated %s UID on initial and full private reads, never loading other user labels',
    async (uid) => {
      const other = uid === 'alice' ? 'bob' : 'alice';
      const projects = metadata();
      projects.set('target', { type: 'personal', createdBy: uid });
      const mock = sdk(
        [
          record(uid, 'a-own', 'target'),
          record(other, 'b-stale-other', 'target'),
          record(uid, 'c-inaccessible', other + '-private', {
            startedAt: null,
          }),
        ],
        projects,
      );
      const repo = new FirestoreProjectReportRepository(mock.db, mock.auth);
      const readPage = vi.spyOn(repo, 'readPage');
      const cursor = 'users/' + uid + '/records/000';
      const result = await getProjectReportHandler(
        repo,
        { projectId: 'target', limit: 1, cursor },
        authFor(uid),
        AS_OF,
      );
      expect(readPage).toHaveBeenNthCalledWith(1, 'target', 1, cursor, uid);
      expect(readPage).toHaveBeenNthCalledWith(
        2,
        'target',
        500,
        undefined,
        uid,
      );
      expect(readPage.mock.calls.every((call) => call[3] === uid)).toBe(true);
      expect(mock.userDoc.mock.calls.every((call) => call[0] === uid)).toBe(
        true,
      );
      expect(mock.getUsers).toHaveBeenCalledExactlyOnceWith([{ uid }]);
      expect(result.records.map((r) => r.uid)).toEqual([uid]);
      expect(result.totalMinutes).toBe(60);
      expectNoTranscripts(result);
    },
  );

  it.each(['work', 'legacy'])(
    'allows both viewers to read shared %s and preserves both UID records',
    async (projectId) => {
      for (const viewer of UIDS) {
        const mock = sdk(UIDS.map((uid) => record(uid, 'own', projectId)));
        const repo = new FirestoreProjectReportRepository(mock.db, mock.auth);
        const page = await repo.readPage(projectId, 20, undefined, viewer);
        expect(page?.personal).toBe(false);
        expect(page?.records.map((r) => r.uid)).toEqual([...UIDS]);
        const readPage = vi.spyOn(repo, 'readPage');
        const result = await getProjectReportHandler(
          repo,
          { projectId },
          authFor(viewer),
          AS_OF,
        );
        expect(readPage.mock.calls.every((call) => call[3] === viewer)).toBe(
          true,
        );
        expect(result.totalMinutes).toBe(120);
        expect(result.byUser.map((r) => r.uid)).toEqual([...UIDS]);
        expect(mock.getUsers).toHaveBeenCalledExactlyOnceWith(
          UIDS.map((uid) => ({ uid })),
        );
        expectNoTranscripts(result);
      }
    },
  );
});
