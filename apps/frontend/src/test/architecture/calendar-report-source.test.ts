import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  nativeCache as mocks,
  project,
  row,
  state,
  type CacheQuery,
} from '../../data/repositories/firestore-report-fixture';
vi.mock(
  'firebase/firestore',
  async () =>
    (await import('../../data/repositories/firestore-report-fixture'))
      .nativeCache.firestore,
);
vi.mock('../../data/sync/workspace-runtime', async () => ({
  observeWorkspace: (
    await import('../../data/repositories/firestore-report-fixture')
  ).nativeCache.observe,
}));
vi.mock('firebase/functions', async () => ({
  httpsCallable: (
    await import('../../data/repositories/firestore-report-fixture')
  ).nativeCache.callable,
}));
const db = mocks.db;
const emit = (value: Parameters<typeof mocks.emit>[0], index = 0) =>
  mocks.emit(value, index);
beforeEach(() => mocks.reset());
afterEach(() => {
  expect(mocks.onSnapshot).not.toHaveBeenCalled();
  expect(mocks.getDocs).not.toHaveBeenCalled();
  expect(mocks.getDocsFromServer).not.toHaveBeenCalled();
  expect(mocks.getDoc).not.toHaveBeenCalled();
  expect(mocks.callable).not.toHaveBeenCalled();
});

import { subscribePersonalReport } from '../../data/sources/personal-report-source';
import { subscribeAuthorizedReport } from '../../data/sources/authorized-report-source';

const range = {
  from: '2026-10-08T00:00:00Z',
  to: '2026-10-09T00:00:00Z',
  projectId: 'p',
};
it('navigation, date and project changes use local observers with ZERO remote Firebase calls and expected native local reads', async () => {
  const personal = vi.fn(),
    company = vi.fn();
  const stopPersonal = subscribePersonalReport(
    db,
    'alice',
    personal,
    vi.fn(),
    ['p'],
    range,
  );
  const stopCompany = subscribeAuthorizedReport(
    db,
    'alice',
    company,
    vi.fn(),
    ['q'],
    { ...range, projectId: 'q' },
  );
  const local = state({
    projects: [project(), project('q')],
    records: [
      row('open'),
      row('closed', { endedAt: '2026-10-08T13:00:00Z' }),
      row('budget', { projectId: 'q', startedAt: '2026-01-01T00:00:00Z' }),
    ],
  });
  await emit(local);
  await emit(local, 1);
  expect(
    (
      await personal.mock.lastCall![0].repository.readPage(
        'alice',
        100,
        undefined,
        range,
      )
    ).records.map((r: { id: string }) => r.id),
  ).toEqual(['closed', 'open']);
  expect(
    await personal.mock.lastCall![0].repository.loadContext(['alice']),
  ).toHaveLength(3);
  expect(
    await company.mock.lastCall![0].repository.readPage(
      100,
      undefined,
      'q',
      range,
    ),
  ).toMatchObject({ records: [expect.objectContaining({ id: 'budget' })] });
  stopPersonal();
  stopCompany();
  const month = vi.fn();
  const stopMonth = subscribePersonalReport(db, 'alice', month, vi.fn(), [], {
    from: '2026-01-01T00:00:00Z',
    to: '2026-02-01T00:00:00Z',
  });
  await emit(local, 2);
  expect(
    (
      await month.mock.lastCall![0].repository.readPage(
        'alice',
        100,
        undefined,
        { from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' },
      )
    ).records.map((r: { id: string }) => r.id),
  ).toEqual(['budget']);
  expect(mocks.getDocsFromCache).toHaveBeenCalledTimes(17);
  const localQueries = mocks.getDocsFromCache.mock.calls.map(
    ([q]) => q as CacheQuery,
  );
  expect(localQueries.some((q) => q.base === 'projects')).toBe(true);
  expect(
    localQueries.some(
      (q) =>
        q.base === 'users/alice/records' &&
        q.constraints.some((c) => c.field === 'projectId'),
    ),
  ).toBe(true);
  expect(
    localQueries.some(
      (q) => typeof q.base !== 'string' && q.base.group === 'records',
    ),
  ).toBe(true);
  stopMonth();
  expect(mocks.observe).toHaveBeenCalledTimes(3);
  for (const observer of mocks.observers)
    expect(observer.stop).toHaveBeenCalledOnce();
});
it('waits for a full atomic materialization and retains missing-end records through native queried branches', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail, [], range);
  await emit(
    state({ complete: false, projects: [project()], records: [row('open')] }),
  );
  expect(next).not.toHaveBeenCalled();
  await emit(
    state({
      projects: [project()],
      records: [
        row('open'),
        row('null-end', { endedAt: null }),
        row('closed', { endedAt: '2026-10-08T13:00:00Z' }),
      ],
    }),
  );
  // Readiness publishes only after one native catalog query, not a remote listener.
  expect(mocks.getDocsFromCache).toHaveBeenCalledTimes(1);
  const context = await next.mock.lastCall![0].repository.loadContext([
    'alice',
  ]);
  expect(context.map((r: { id: string }) => r.id)).toEqual([
    'closed',
    'null-end',
    'open',
  ]);
  expect(context[2].endedAt).toBeUndefined();
  expect(context[1].endedAt).toBeUndefined();
  expect(fail).not.toHaveBeenCalled();
});
it('local project moves update selection atomically without narrowing global budget context', async () => {
  const next = vi.fn();
  subscribePersonalReport(db, 'alice', next, vi.fn(), ['p'], range);
  await emit(
    state({ projects: [project(), project('q')], records: [row('moving')] }),
  );
  const old = next.mock.lastCall![0].repository;
  const oldContext = await old.loadContext(['alice']);
  await emit(
    state({
      complete: false,
      projects: [project(), project('q')],
      records: [row('moving', { projectId: 'q' })],
    }),
  );
  expect(next).toHaveBeenCalledOnce();
  await emit(
    state({
      projects: [project(), project('q')],
      records: [row('moving', { projectId: 'q' })],
    }),
  );
  expect(next.mock.lastCall![0].coherent).toBe(true);
  expect(
    (
      await next.mock.lastCall![0].repository.readPage(
        'alice',
        100,
        undefined,
        range,
      )
    ).records,
  ).toEqual([]);
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice']))[0]
      .projectId,
  ).toBe('q');
  expect(oldContext[0].projectId).toBe('p');
});
it('one revision updates facts and metadata together; removal/revocation cannot resurrect old rows', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  const stop = subscribePersonalReport(db, 'alice', next, fail, [], range);
  await emit(
    state({
      projects: [project()],
      records: [row('closed', { endedAt: '2026-10-08T13:00:00Z' })],
    }),
  );
  const old = next.mock.lastCall![0].repository;
  const oldContext = await old.loadContext(['alice']);
  await emit(
    state({
      projects: [project('p', { topics: [{ id: 'new', title: 'New' }] })],
      records: [row('closed', { endedAt: '2026-10-08T14:00:00Z' })],
    }),
  );
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice']))[0].endedAt,
  ).toBe('2026-10-08T14:00:00Z');
  expect(
    await next.mock.lastCall![0].repository.readTopics(['p'], 'alice'),
  ).toEqual({ p: [{ id: 'new', title: 'New' }] });
  expect(oldContext[0].endedAt).toBe('2026-10-08T13:00:00Z');
  await emit(state());
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  const calls = next.mock.calls.length;
  stop();
  await emit(state({ projects: [project()], records: [row('late')] }));
  expect(next).toHaveBeenCalledTimes(calls);
  expect(fail).not.toHaveBeenCalled();
});
it('reports synchronization errors instead of emitting silently partial calendar totals', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribePersonalReport(db, 'alice', next, fail, [], range);
  await emit(state({ complete: false }));
  await emit(state({ error: 'IndexedDB unavailable' }));
  expect(next).not.toHaveBeenCalled();
  expect(fail.mock.lastCall?.[0].message).toContain('IndexedDB');
});
