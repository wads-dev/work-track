import { expect, it, vi } from 'vitest';
import {
  createWorkspaceSync,
  type SyncResponse,
  type SyncInput,
} from './workspace-sync';
import {
  emptyWorkspace,
  type WorkspaceData,
  type WorkspaceStorage,
} from './workspace-storage';
const project = { id: 'p', data: { type: 'work', topics: [] } };
const row = (id: string) => ({
  path: 'users/alice/records/' + id,
  data: { uid: 'alice', projectId: 'p', startedAt: '2026-10-12T10:00:00Z' },
});
function memory(initial: WorkspaceData = emptyWorkspace()) {
  let value = structuredClone(initial);
  const storage: WorkspaceStorage = {
    load: vi.fn(async () => structuredClone(value)),
    save: vi.fn(async (data) => {
      value = structuredClone(data);
    }),
    close: vi.fn(),
  };
  return { storage, value: () => value };
}
const response = (
  cursor = 0,
  extra: Partial<SyncResponse> = {},
): SyncResponse => ({
  cursor,
  head: cursor,
  projects: [project],
  events: [],
  hasMore: false,
  ...extra,
});
async function settle() {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}
it('bootstraps once and reload/focus resumes only persisted delta', async () => {
  const disk = memory();
  const pull = vi.fn(async (input: SyncInput) =>
    input.bootstrap
      ? response(3, {
          bootstrap: { projectId: 'p', rows: [row('r')], after: null },
        })
      : response(input.cursor ?? 3),
  );
  const stop = vi.fn();
  const listen = vi.fn(() => stop);
  const sync = createWorkspaceSync('alice', disk.storage, { pull, listen });
  sync.focus(true);
  await settle();
  expect(sync.snapshot().complete).toBe(true);
  expect(disk.value().cursor).toBe(3);
  expect(pull.mock.calls.filter(([i]) => i.bootstrap)).toHaveLength(1);
  for (let i = 0; i < 30; i++) sync.subscribe(() => {})();
  expect(pull).toHaveBeenCalledTimes(3);
  sync.focus(false);
  expect(stop).toHaveBeenCalledOnce();
  expect(sync.snapshot().records).toEqual([]);
  sync.focus(true);
  await settle();
  expect(pull).toHaveBeenLastCalledWith({ cursor: 3 });
  sync.dispose();
  const reload = createWorkspaceSync('alice', disk.storage, { pull, listen });
  reload.focus(true);
  await settle();
  expect(pull.mock.calls.filter(([i]) => i.bootstrap)).toHaveLength(1);
  expect(reload.snapshot().records).toHaveLength(1);
  reload.dispose();
});
it('replays update and hard delete made during bootstrap before publishing complete', async () => {
  const disk = memory();
  let calls = 0;
  const pull = vi.fn(async (input: SyncInput) => {
    calls++;
    if (input.bootstrap)
      return response(4, {
        head: 6,
        bootstrap: {
          projectId: 'p',
          rows: [row('deleted'), row('edited')],
          after: null,
        },
      });
    if (calls === 1) return response(4);
    return response(6, {
      events: [
        { revision: 5, path: row('deleted').path, data: null },
        {
          revision: 6,
          path: row('edited').path,
          data: { ...row('edited').data, interpretation: 'new' },
        },
      ],
    });
  });
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull,
    listen: () => () => {},
  });
  const complete: number[] = [];
  sync.subscribe((s) => {
    if (s.complete) complete.push(s.records.length);
  });
  sync.focus(true);
  await settle();
  expect(complete).toEqual([1]);
  expect(disk.value().records[0].data.interpretation).toBe('new');
  expect(disk.value().cursor).toBe(6);
  sync.dispose();
});
it('paged deltas persist physical cursor even when filtered events are absent', async () => {
  const disk = memory({
    projects: [project],
    records: [row('r')],
    completedProjects: ['p'],
    cursor: 1,
  });
  const pull = vi.fn(async (input: SyncInput) =>
    input.cursor === 1
      ? response(251, { head: 300, hasMore: true })
      : response(300),
  );
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull,
    listen: () => () => {},
  });
  sync.focus(true);
  await settle();
  expect(pull).toHaveBeenLastCalledWith({ cursor: 251 });
  expect(sync.snapshot().cursor).toBe(300);
  sync.dispose();
});
it('revocation purges records and grant bootstraps only the newly authorized project', async () => {
  const disk = memory({
    projects: [project],
    records: [row('r')],
    completedProjects: ['p'],
    cursor: 5,
  });
  const pull = vi.fn(async () => response(6, { projects: [] }));
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull,
    listen: () => () => {},
  });
  sync.focus(true);
  await settle();
  expect(disk.value().records).toEqual([]);
  expect(disk.value().completedProjects).toEqual([]);
  sync.dispose();
  const grant = vi.fn(async (i: SyncInput) =>
    i.bootstrap
      ? response(6, {
          bootstrap: { projectId: 'p', rows: [row('r')], after: null },
        })
      : response(6),
  );
  const second = createWorkspaceSync('alice', disk.storage, {
    pull: grant,
    listen: () => () => {},
  });
  second.focus(true);
  await settle();
  expect(grant.mock.calls.filter(([i]) => i.bootstrap)).toHaveLength(1);
  second.dispose();
});
it('failed durable write never exposes data or advances the persisted cursor', async () => {
  const disk = memory({
    projects: [project],
    records: [row('r')],
    completedProjects: ['p'],
    cursor: 1,
  });
  disk.storage.save = vi.fn(async () => {
    throw new Error('quota');
  });
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull: async () => response(2),
    listen: () => () => {},
  });
  sync.focus(true);
  await settle();
  expect(sync.snapshot().complete).toBe(false);
  expect(sync.snapshot().error).toBe('quota');
  expect(disk.value().cursor).toBe(1);
  sync.dispose();
});
it('discards responses after logout or focus loss and serializes resume', async () => {
  const disk = memory();
  let finish!: (r: SyncResponse) => void;
  const pull = vi.fn(
    () =>
      new Promise<SyncResponse>((resolve) => {
        finish = resolve;
      }),
  );
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull,
    listen: () => () => {},
  });
  sync.focus(true);
  await settle();
  sync.focus(false);
  finish(response(5));
  await settle();
  expect(disk.storage.save).not.toHaveBeenCalled();
  expect(sync.snapshot().complete).toBe(false);
  sync.dispose();
});
it('does not persist partially bootstrapped project on interruption', async () => {
  const disk = memory();
  let finish!: (r: SyncResponse) => void;
  const pull = vi.fn(async (input: SyncInput) => {
    if (!input.bootstrap) return response(1);
    if (!input.bootstrap.after)
      return response(1, {
        bootstrap: { projectId: 'p', rows: [row('r')], after: row('r').path },
      });
    return new Promise<SyncResponse>((resolve) => {
      finish = resolve;
    });
  });
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull,
    listen: () => () => {},
  });
  sync.focus(true);
  await settle();
  sync.focus(false);
  finish(response(1));
  await settle();
  expect(disk.value().completedProjects).toEqual([]);
  expect(disk.value().cursor).toBeUndefined();
  sync.dispose();
});
it('integrates owner audit and removes it with its parent', async () => {
  const audit = {
    path: row('r').path + '/audit/a',
    data: { authorUid: 'alice', after: {} },
  };
  const disk = memory();
  const pull = vi.fn(async (i: SyncInput) =>
    i.bootstrap
      ? response(1, {
          bootstrap: { projectId: 'p', rows: [row('r'), audit], after: null },
        })
      : response(i.cursor ?? 1),
  );
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull,
    listen: () => () => {},
  });
  sync.focus(true);
  await settle();
  expect(sync.snapshot().audits).toEqual([audit]);
  pull.mockImplementation(async () =>
    response(2, { events: [{ revision: 2, path: row('r').path, data: null }] }),
  );
  sync.retry();
  await settle();
  expect(disk.value().audits).toEqual([]);
  sync.dispose();
});
it('rebootstraps only changed project generation, never metadata-only changes', async () => {
  const disk = memory({
    cursor: 2,
    projects: [{ ...project, generation: 'old' }],
    projectGenerations: { p: 'old' },
    completedProjects: ['p'],
    records: [row('old')],
    audits: [],
  });
  const projects = [{ ...project, generation: 'new' }];
  const pull = vi.fn(async (i: SyncInput) =>
    i.bootstrap
      ? response(2, {
          projects,
          bootstrap: { projectId: 'p', rows: [row('new')], after: null },
        })
      : response(2, { projects }),
  );
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull,
    listen: () => () => {},
  });
  sync.focus(true);
  await settle();
  expect(disk.value().records.map((r) => r.path)).toEqual([row('new').path]);
  expect(disk.value().projectGenerations).toEqual({ p: 'new' });
  sync.retry();
  await settle();
  expect(pull.mock.calls.filter(([i]) => i.bootstrap)).toHaveLength(1);
  sync.dispose();
});
it('rejects terminal gap instead of displaying partial totals', async () => {
  const disk = memory({
    cursor: 1,
    projects: [project],
    completedProjects: ['p'],
    records: [row('r')],
    audits: [],
  });
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull: async () => response(1, { head: 3 }),
    listen: () => () => {},
  });
  sync.focus(true);
  await settle();
  expect(sync.snapshot().complete).toBe(false);
  expect(sync.snapshot().error).toContain('Journal incompleto');
  sync.dispose();
});
it('central retry recovers transient pull failure without reload or bootstrap', async () => {
  const disk = memory({
    cursor: 1,
    projects: [project],
    completedProjects: ['p'],
    records: [row('r')],
    audits: [],
  });
  const pull = vi
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue(response(1));
  const sync = createWorkspaceSync('alice', disk.storage, {
    pull,
    listen: () => () => {},
  });
  sync.focus(true);
  await settle();
  expect(sync.snapshot().complete).toBe(false);
  sync.retry();
  await settle();
  expect(sync.snapshot().complete).toBe(true);
  expect(pull).toHaveBeenCalledTimes(2);
  sync.dispose();
});
