import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import {
  syncWorkspaceHandler,
  type SyncEvent,
  type SyncStore,
} from './sync-workspace.js';
const auth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
function fixture(events: SyncEvent[] = []) {
  const store: SyncStore = {
    head: vi.fn(() =>
      Promise.resolve(
        events.length
          ? Math.max(
              999 * Number(events.length === 250),
              events.at(-1)!.revision,
            )
          : 999,
      ),
    ),
    projects: vi.fn(() =>
      Promise.resolve([
        { path: 'projects/work', data: { type: 'work' } },
        { path: 'projects/legacy', data: { title: 'Legacy' } },
        {
          path: 'projects/mine',
          data: { type: 'personal', createdBy: 'alice' },
        },
        {
          path: 'projects/private',
          data: { type: 'personal', createdBy: 'bob', secret: 'private' },
        },
        { path: 'projects/invalid', data: { type: 'invalid' } },
      ]),
    ),
    events: vi.fn(() => Promise.resolve(events)),
    bootstrap: vi.fn(() => Promise.resolve([])),
    currentRows: vi.fn(() =>
      Promise.resolve(
        events.flatMap((event) =>
          event.data ? [{ path: event.path, data: event.data }] : [],
        ),
      ),
    ),
  };
  return store;
}
const event = (revision: number, projectId = 'private'): SyncEvent => ({
  revision,
  path: 'users/bob/records/r' + revision,
  projectId,
  data: { projectId, secret: 'secret' },
});
describe('syncWorkspace authorization and bounded cursor protocol', () => {
  it('authenticates before any reads; denies anonymous/noncorporate/unverified', async () => {
    const store = fixture();
    await expect(syncWorkspaceHandler(store, {})).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    for (const token of [
      { ...auth.token, email_verified: false },
      { ...auth.token, email: 'x@other.dev' },
      { ...auth.token, firebase: { sign_in_provider: 'anonymous' } },
    ])
      await expect(
        syncWorkspaceHandler(store, {}, { ...auth, token }),
      ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.head).not.toHaveBeenCalled();
  });
  it('initial capture discovers full ACL catalog including legacy without reading records', async () => {
    const store = fixture();
    const result = await syncWorkspaceHandler(
      store,
      { knownProjectIds: ['private'] },
      auth,
    );
    expect(result.projects.map((p) => p.id)).toEqual([
      'work',
      'legacy',
      'mine',
    ]);
    expect(result).toMatchObject({
      cursor: 999,
      head: 999,
      events: [],
      hasMore: false,
    });
    expect(store.events).not.toHaveBeenCalled();
    expect(store.bootstrap).not.toHaveBeenCalled();
  });
  it('fully filtered physical page advances cursor, with hasMore and no leaked paths', async () => {
    const store = fixture(Array.from({ length: 250 }, (_, i) => event(i + 1)));
    const result = await syncWorkspaceHandler(store, { cursor: 0 }, auth);
    expect(result).toMatchObject({ cursor: 250, hasMore: true, events: [] });
    expect(store.events).toHaveBeenCalledWith(0, 999);
    expect(store.bootstrap).not.toHaveBeenCalled();
  });
  it('only authorizes current projects, hides project events, handles deletes/moves without destination data', async () => {
    const store = fixture([
      event(1, 'work'),
      { ...event(2), previousProjectId: 'work' },
      { ...event(3), data: null, previousProjectId: 'mine' },
      { ...event(4), data: null, previousProjectId: 'private' },
      { ...event(5, 'work'), path: 'projects/work' },
      event(6, 'missing'),
      event(7, 'legacy'),
    ]);
    const result = await syncWorkspaceHandler(
      store,
      { cursor: 0, knownProjectIds: ['missing', 'private'] },
      auth,
    );
    expect(result.events.map((e) => e.revision)).toEqual([1, 2, 3, 7]);
    expect(result.events.slice(1, 3).map((e) => e.data)).toEqual([null, null]);
    expect(result.cursor).toBe(7);
    expect(result.hasMore).toBe(false);
  });
  it('missing terminal head fails explicitly rather than returning incomplete delta', async () => {
    await expect(
      syncWorkspaceHandler(fixture(), { cursor: 42 }, auth),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const store = fixture();
    vi.mocked(store.head).mockResolvedValue(42);
    expect(
      await syncWorkspaceHandler(store, { cursor: 42 }, auth),
    ).toMatchObject({ cursor: 42, head: 42, hasMore: false });
  });
  it('bootstrap preserves supplied cursor, tombstones, normalized timestamps and path pagination', async () => {
    const store = fixture();
    const rows = Array.from({ length: 250 }, (_, i) => ({
      path: 'users/alice/records/r' + i,
      data: {
        projectId: 'mine',
        deletedAt: Timestamp.fromMillis(0),
        nested: [Timestamp.fromMillis(1)],
      },
    }));
    vi.mocked(store.bootstrap).mockResolvedValue(rows);
    const result = await syncWorkspaceHandler(
      store,
      {
        cursor: 7,
        bootstrap: { projectId: 'mine', after: 'users/alice/records/prior' },
      },
      auth,
    );
    expect(result).toMatchObject({
      cursor: 7,
      events: [],
      hasMore: false,
      bootstrap: { after: rows.at(-1)!.path },
    });
    expect('bootstrap' in result && result.bootstrap.rows[0]!.data).toEqual({
      projectId: 'mine',
      deletedAt: '1970-01-01T00:00:00.000Z',
      nested: ['1970-01-01T00:00:00.001Z'],
    });
    expect(store.bootstrap).toHaveBeenCalledWith(
      'mine',
      'users/alice/records/prior',
      'alice',
    );
    expect(store.events).not.toHaveBeenCalled();
  });
  it('bootstrap end and explicit unauthorized rejection', async () => {
    const store = fixture();
    expect(
      await syncWorkspaceHandler(
        store,
        { cursor: 7, bootstrap: { projectId: 'work' } },
        auth,
      ),
    ).toMatchObject({ bootstrap: { after: null, rows: [] } });
    await expect(
      syncWorkspaceHandler(
        store,
        { bootstrap: { projectId: 'private' } },
        auth,
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.bootstrap).toHaveBeenCalledTimes(1);
  });
  it('catalog budget rejects instead of silently returning partial data', async () => {
    const store = fixture();
    vi.mocked(store.projects).mockResolvedValue(
      Array.from({ length: 1001 }, (_, i) => ({
        path: 'projects/' + i,
        data: {},
      })),
    );
    await expect(
      syncWorkspaceHandler(store, { cursor: 0 }, auth),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(store.events).not.toHaveBeenCalled();
  });
  it.each([
    { cursor: -1 },
    { cursor: 1.5 },
    { cursor: Number.MAX_SAFE_INTEGER + 1 },
    { bootstrap: { projectId: 'x/y' } },
    { bootstrap: { projectId: 'mine', after: 'projects/x' } },
    { unexpected: true },
  ])('rejects malformed input %j without reads', async (raw) => {
    const store = fixture();
    await expect(syncWorkspaceHandler(store, raw, auth)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(store.head).not.toHaveBeenCalled();
  });
  it('audit deltas are owner-only and use current parent project ACL, with deduplicated reads', async () => {
    const audit = (
      revision: number,
      owner: string,
      record: string,
      data: Record<string, unknown> | null = { secret: 'audit' },
    ): SyncEvent => ({
      revision,
      path: 'users/' + owner + '/records/' + record + '/audit/a' + revision,
      projectId: 'work',
      data,
    });
    const store = fixture([
      audit(1, 'bob', 'r'),
      audit(2, 'alice', 'r'),
      audit(3, 'alice', 'r', null),
      audit(4, 'alice', 'moved'),
      audit(5, 'alice', 'deleted'),
      audit(6, 'alice', 'missing'),
    ]);
    vi.mocked(store.currentRows).mockResolvedValue([
      { path: 'users/alice/records/r/audit/a2', data: { secret: 'audit' } },
      { path: 'users/alice/records/r', data: { projectId: 'mine' } },
      { path: 'users/alice/records/moved', data: { projectId: 'private' } },
      {
        path: 'users/alice/records/deleted',
        data: { projectId: 'work', deletedAt: 'now' },
      },
    ]);
    const result = await syncWorkspaceHandler(store, { cursor: 0 }, auth);
    expect(result.events).toEqual([
      {
        revision: 2,
        path: 'users/alice/records/r/audit/a2',
        data: { secret: 'audit' },
      },
      { revision: 3, path: 'users/alice/records/r/audit/a3', data: null },
      { revision: 4, path: 'users/alice/records/moved/audit/a4', data: null },
      { revision: 5, path: 'users/alice/records/deleted/audit/a5', data: null },
      { revision: 6, path: 'users/alice/records/missing/audit/a6', data: null },
    ]);
    expect(store.currentRows).toHaveBeenCalledWith([
      'users/alice/records/r/audit/a2',
      'users/alice/records/r',
      'users/alice/records/r/audit/a3',
      'users/alice/records/moved/audit/a4',
      'users/alice/records/moved',
      'users/alice/records/deleted/audit/a5',
      'users/alice/records/deleted',
      'users/alice/records/missing/audit/a6',
      'users/alice/records/missing',
    ]);
    expect(store.bootstrap).not.toHaveBeenCalled();
    expect(result.cursor).toBe(6);
  });
  it('audit rows never become bootstrap record pagination cursors', async () => {
    const store = fixture();
    const records = Array.from({ length: 250 }, (_, i) => ({
      path: 'users/alice/records/r' + i,
      data: { projectId: 'mine' },
    }));
    vi.mocked(store.bootstrap).mockResolvedValue([
      ...records,
      { path: 'users/alice/records/r249/audit/a', data: { secret: 'audit' } },
    ]);
    const result = await syncWorkspaceHandler(
      store,
      { bootstrap: { projectId: 'mine' } },
      auth,
    );
    expect(result).toMatchObject({
      bootstrap: { after: records.at(-1)!.path },
    });
    expect('bootstrap' in result && result.bootstrap.rows).toContainEqual({
      path: 'users/alice/records/r249/audit/a',
      data: { secret: 'audit' },
    });
  });
  it('hydrates all scanned records, never leaks historical payload or downgrades canonical bootstrap', async () => {
    const historical = [
      event(1, 'work'),
      event(2, 'work'),
      event(3, 'private'),
    ];
    const store = fixture(historical);
    vi.mocked(store.currentRows).mockResolvedValue([
      {
        path: historical[0]!.path,
        data: { projectId: 'private', secret: 'moved' },
      },
      { path: historical[1]!.path, data: { projectId: 'work', version: 42 } },
      { path: historical[2]!.path, data: { projectId: 'work', version: 43 } },
    ]);
    const result = await syncWorkspaceHandler(store, { cursor: 0 }, auth);
    expect(result.events.map((row) => row.data)).toEqual([
      null,
      { projectId: 'work', version: 42 },
      { projectId: 'work', version: 43 },
    ]);
    expect(JSON.stringify(result)).not.toContain('moved');
    expect(store.currentRows).toHaveBeenCalledWith(
      historical.map((row) => row.path),
    );
  });
  it('actual missing row emits null from authorized event project without previous id', async () => {
    const store = fixture([event(1, 'work')]);
    vi.mocked(store.currentRows).mockResolvedValue([]);
    expect(
      (await syncWorkspaceHandler(store, { cursor: 0 }, auth)).events,
    ).toEqual([{ revision: 1, path: event(1).path, data: null }]);
  });
  it.each([[event(2)], [event(1), event(3)], [event(1), event(1)]])(
    'rejects noncontiguous physical revisions before hydrating %j',
    async (...events) => {
      const store = fixture(events);
      await expect(
        syncWorkspaceHandler(store, { cursor: 0 }, auth),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(store.currentRows).not.toHaveBeenCalled();
    },
  );
  it('full page at captured head can request a final empty page', async () => {
    const store = fixture(Array.from({ length: 250 }, (_, i) => event(i + 1)));
    vi.mocked(store.head).mockResolvedValue(250);
    expect(
      await syncWorkspaceHandler(store, { cursor: 0 }, auth),
    ).toMatchObject({ cursor: 250, hasMore: true });
    vi.mocked(store.events).mockResolvedValue([]);
    expect(
      await syncWorkspaceHandler(store, { cursor: 250 }, auth),
    ).toMatchObject({ cursor: 250, hasMore: false });
  });
  it('passes explicit project generation token independently of metadata', async () => {
    const store = fixture();
    vi.mocked(store.projects).mockResolvedValue([
      {
        path: 'projects/work',
        data: { type: 'work' },
        generation: 'creation:5',
      },
    ]);
    expect(
      (await syncWorkspaceHandler(store, {}, auth)).projects[0]?.generation,
    ).toBe('creation:5');
  });
  it('rejects cursors after head to protect cache recovery', async () => {
    await expect(
      syncWorkspaceHandler(fixture(), { cursor: 1000 }, auth),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
