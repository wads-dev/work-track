import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
interface MockDoc {
  id: string;
  ref?: { path: string };
  data(): Record<string, unknown>;
}
type MockSnapshot = {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
} & (
  { docs: MockDoc[] } | { exists(): boolean; data(): Record<string, unknown> }
);
interface MockQuery {
  base: unknown;
  constraints: unknown[];
}
const mock = vi.hoisted(() => ({
  listeners: [] as {
    q: unknown;
    next: (s: MockSnapshot) => void;
    fail: (e: Error) => void;
    stop: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('firebase/firestore', () => ({
  collection: (_d: unknown, p: string) => ({ path: p }),
  collectionGroup: (_d: unknown, p: string) => ({ group: p }),
  doc: (_d: unknown, p: string, id: string) => ({ path: p + '/' + id }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (base: unknown, ...constraints: unknown[]) => ({ base, constraints }),
  onSnapshot: (
    q: unknown,
    _o: unknown,
    next: (s: MockSnapshot) => void,
    fail: (e: Error) => void,
  ) => {
    const stop = vi.fn();
    mock.listeners.push({ q, next, fail, stop });
    return stop;
  },
}));
import {
  authorizedRecordQueries,
  subscribeAuthorizedReport,
} from './authorized-report-source';
const db = {} as Firestore;
const range = {
  from: '2026-10-08T00:00:00Z',
  to: '2026-10-09T00:00:00Z',
  projectId: 'a',
};
const fact = {
  uid: 'alice',
  projectId: 'a',
  startedAt: '2026-10-08T12:00:00Z',
  endedAt: '2026-10-08T13:00:00Z',
  timeZone: 'UTC',
  topics: [],
};
const record = (data = fact) => ({
  id: 'r',
  ref: { path: 'users/alice/records/r' },
  data: () => data,
});
const batch = (docs: MockDoc[], cache = false, pending = false) => ({
  docs,
  metadata: { fromCache: cache, hasPendingWrites: pending },
});
const catalog = (rows: [string, Record<string, unknown>][]) =>
  batch(rows.map(([id, data]) => ({ id, data: () => data })));
const parent = (data: Record<string, unknown>, pending = false) => ({
  exists: () => true,
  data: () => data,
  metadata: { fromCache: false, hasPendingWrites: pending },
});
beforeEach(() => (mock.listeners.length = 0));
it('puts project and temporal bounds into both selection queries before snapshots transfer', () => {
  const q = authorizedRecordQueries(db, 'a', range) as unknown as MockQuery[];
  expect(q).toHaveLength(2);
  for (const x of q) {
    expect(x.base).toEqual({ group: 'records' });
    expect(x.constraints).toContainEqual({
      field: 'projectId',
      op: '==',
      value: 'a',
    });
    expect(x.constraints).toContainEqual({
      field: 'startedAt',
      op: '<',
      value: '2026-10-11',
    });
  }
  expect(q[0].constraints).toContainEqual({
    field: 'startedAt',
    op: '>=',
    value: '2026-10-06',
  });
  expect(q[1].constraints).toContainEqual({
    field: 'endedAt',
    op: '>=',
    value: '2026-10-06',
  });
});
it('waits for full context and both branches, marks cache provisional and disposes auth-scoped listeners', async () => {
  const next = vi.fn(),
    fail = vi.fn(),
    stop = subscribeAuthorizedReport(db, 'viewer', next, fail, [], range);
  mock.listeners[0].next(catalog([['a', { type: 'work', topics: [] }]]));
  mock.listeners[1].next(catalog([]));
  expect(mock.listeners).toHaveLength(5);
  mock.listeners[2].next(batch([record()]));
  mock.listeners[3].next(batch([record()], true));
  expect(next).not.toHaveBeenCalled();
  mock.listeners[4].next(batch([record()]));
  expect(next.mock.lastCall![0]).toMatchObject({
    coherent: true,
    fromCache: true,
  });
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toHaveLength(1);
  stop();
  for (const l of mock.listeners) expect(l.stop).toHaveBeenCalledOnce();
  const count = next.mock.calls.length;
  mock.listeners[4].next(batch([]));
  expect(next).toHaveBeenCalledTimes(count);
});
it('retains immutable calculation during divergent updates and removes revoked parents immediately', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail, [], range);
  mock.listeners[0].next(catalog([['a', { type: 'work', topics: [] }]]));
  mock.listeners[1].next(catalog([]));
  for (let i = 2; i < 5; i++) mock.listeners[i].next(batch([record()]));
  const previous = next.mock.lastCall![0].repository;
  mock.listeners[3].next(
    batch([record({ ...fact, endedAt: '2026-10-08T14:00:00Z' })]),
  );
  expect(next.mock.lastCall![0].coherent).toBe(false);
  expect(next.mock.lastCall![0].repository).toBe(previous);
  mock.listeners[0].next(catalog([]));
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  for (let i = 2; i < 5; i++)
    expect(mock.listeners[i].stop).toHaveBeenCalledOnce();
});
it('clears listener lifecycle on permission errors instead of serving old records', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail);
  mock.listeners[0].fail(new Error('permission-denied'));
  expect(fail).toHaveBeenCalledOnce();
  for (const l of mock.listeners) expect(l.stop).toHaveBeenCalledOnce();
  mock.listeners[1].next(catalog([]));
  expect(next).not.toHaveBeenCalled();
});
it('includes legacy catalog parents, waits for snapshots and deduplicates IDs', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail, ['legacy', 'legacy']);
  expect(mock.listeners).toHaveLength(3);
  mock.listeners[0].next(catalog([]));
  mock.listeners[1].next(catalog([]));
  expect(next).not.toHaveBeenCalled();
  mock.listeners[2].next({
    exists: () => true,
    data: () => ({ topics: [] }),
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  expect(mock.listeners).toHaveLength(4);
  expect(next).not.toHaveBeenCalled();
  mock.listeners[3].next(batch([record({ ...fact, projectId: 'legacy' })]));
  expect(next.mock.lastCall![0].coherent).toBe(true);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toHaveLength(1);
});
it('keeps concurrent personal subscriptions independent and ignores unsubscribed viewer callbacks', async () => {
  const nextA = vi.fn(),
    failA = vi.fn(),
    nextB = vi.fn(),
    failB = vi.fn();
  const stopA = subscribeAuthorizedReport(
    db,
    'viewerA',
    nextA,
    failA,
    ['personalA'],
    {
      ...range,
      projectId: 'personalA',
    },
  );
  const catalogsA = mock.listeners.slice();
  const stopB = subscribeAuthorizedReport(
    db,
    'viewerB',
    nextB,
    failB,
    ['personalB'],
    {
      ...range,
      projectId: 'personalB',
    },
  );
  const catalogsB = mock.listeners.slice(3);
  const personalA = { type: 'personal', createdBy: 'viewerA', topics: [] },
    personalB = { type: 'personal', createdBy: 'viewerB', topics: [] };
  expect(catalogsA[1].q).toMatchObject({
    constraints: expect.arrayContaining([
      { field: 'createdBy', op: '==', value: 'viewerA' },
    ]),
  });
  expect(catalogsB[1].q).toMatchObject({
    constraints: expect.arrayContaining([
      { field: 'createdBy', op: '==', value: 'viewerB' },
    ]),
  });
  expect(catalogsA[2].q).toEqual({ path: 'projects/personalA' });
  expect(catalogsB[2].q).toEqual({ path: 'projects/personalB' });
  catalogsA[0].next(catalog([]));
  catalogsB[0].next(catalog([]));
  catalogsA[1].next(catalog([['personalA', personalA]]));
  const recordsA = mock.listeners.slice(6);
  catalogsB[2].next(parent(personalB));
  const recordsB = mock.listeners.slice(9);
  expect(recordsA).toHaveLength(3);
  expect(recordsB).toHaveLength(3);
  catalogsA[2].next(parent(personalA));
  catalogsB[1].next(catalog([['personalB', personalB]]));
  const docA = {
      id: 'r',
      ref: { path: 'users/viewerA/records/r' },
      data: () => ({ ...fact, uid: 'viewerA', projectId: 'personalA' }),
    },
    docB = {
      id: 'r',
      ref: { path: 'users/viewerB/records/r' },
      data: () => ({ ...fact, uid: 'viewerB', projectId: 'personalB' }),
    };
  for (let i = 0; i < 3; i++) {
    recordsA[i].next(batch([docA]));
    recordsB[i].next(batch([docB]));
  }
  const repositoryA = nextA.mock.lastCall![0].repository,
    repositoryB = nextB.mock.lastCall![0].repository;
  expect(repositoryA.viewer).toBe('viewerA');
  expect(repositoryB.viewer).toBe('viewerB');
  expect([...repositoryA.projects.keys()]).toEqual(['personalA']);
  expect([...repositoryB.projects.keys()]).toEqual(['personalB']);
  expect(await repositoryA.calendar().own.loadContext(['viewerA'])).toEqual([
    expect.objectContaining({ uid: 'viewerA', projectId: 'personalA' }),
  ]);
  expect(await repositoryB.calendar().own.loadContext(['viewerB'])).toEqual([
    expect.objectContaining({ uid: 'viewerB', projectId: 'personalB' }),
  ]);
  stopA();
  const countA = nextA.mock.calls.length,
    countB = nextB.mock.calls.length;
  for (const listener of [...catalogsA, ...recordsA]) {
    expect(listener.stop).toHaveBeenCalledOnce();
    listener.fail(new Error('permission-denied'));
  }
  catalogsA[0].next(catalog([['late-work', { type: 'work', topics: [] }]]));
  catalogsA[1].next(catalog([['personalB', personalB]]));
  catalogsA[2].next(parent(personalB));
  for (const listener of recordsA) listener.next(batch([docA], true, true));
  expect(mock.listeners).toHaveLength(12);
  expect(nextA).toHaveBeenCalledTimes(countA);
  expect(nextB).toHaveBeenCalledTimes(countB);
  expect(nextB.mock.lastCall![0].repository).toBe(repositoryB);
  expect(failA).not.toHaveBeenCalled();
  expect(failB).not.toHaveBeenCalled();
  for (const listener of [...catalogsB, ...recordsB])
    expect(listener.stop).not.toHaveBeenCalled();
  const updatedB = {
    ...docB,
    data: () => ({ ...docB.data(), endedAt: '2026-10-08T14:00:00Z' }),
  };
  for (const listener of recordsB) listener.next(batch([updatedB]));
  expect(nextB.mock.calls.length).toBeGreaterThan(countB);
  expect(nextB.mock.lastCall![0]).toMatchObject({
    coherent: true,
    fromCache: false,
    hasPendingWrites: false,
  });
  expect(
    await nextB.mock
      .lastCall![0].repository.calendar()
      .own.loadContext(['viewerB']),
  ).toEqual([
    expect.objectContaining({
      uid: 'viewerB',
      projectId: 'personalB',
      endedAt: '2026-10-08T14:00:00Z',
    }),
  ]);
  expect([...nextB.mock.lastCall![0].repository.projects.keys()]).toEqual([
    'personalB',
  ]);
  stopB();
  for (const listener of [...catalogsB, ...recordsB])
    expect(listener.stop).toHaveBeenCalledOnce();
});
const listenerRoles = [
  ['work catalog', 0],
  ['personal catalog', 1],
  ['explicit parent', 2],
  ['full context', 3],
  ['started selection', 4],
  ['ended selection', 5],
] as const;
const coherentSnapshots = () => [
  catalog([['a', { type: 'work', topics: [] }]]),
  catalog([]),
  parent({ type: 'work', topics: [] }),
  batch([record()]),
  batch([record()]),
  batch([record()]),
];
it.each(listenerRoles)(
  'marks pending writes from %s provisional until acknowledged',
  (_label, index) => {
    const next = vi.fn(),
      fail = vi.fn();
    const stop = subscribeAuthorizedReport(
      db,
      'viewer',
      next,
      fail,
      ['a'],
      range,
    );
    const snapshots = coherentSnapshots();
    snapshots.forEach((snapshot, i) =>
      mock.listeners[i].next({
        ...snapshot,
        metadata: { fromCache: false, hasPendingWrites: i === index },
      }),
    );
    expect(next.mock.lastCall![0]).toMatchObject({
      coherent: true,
      fromCache: false,
      hasPendingWrites: true,
    });
    mock.listeners[index].next(snapshots[index]);
    expect(next.mock.lastCall![0]).toMatchObject({
      coherent: true,
      fromCache: false,
      hasPendingWrites: false,
    });
    expect(fail).not.toHaveBeenCalled();
    stop();
  },
);
it.each(listenerRoles)(
  'clears cached metadata from %s on a coherent server snapshot',
  async (_label, index) => {
    const next = vi.fn(),
      fail = vi.fn();
    const stop = subscribeAuthorizedReport(
      db,
      'viewer',
      next,
      fail,
      ['a'],
      range,
    );
    const snapshots = coherentSnapshots();
    snapshots.forEach((snapshot, i) =>
      mock.listeners[i].next({
        ...snapshot,
        metadata: { fromCache: i === index, hasPendingWrites: false },
      }),
    );
    expect(next.mock.lastCall![0]).toMatchObject({
      coherent: true,
      fromCache: true,
      hasPendingWrites: false,
    });
    mock.listeners[index].next(snapshots[index]);
    expect(next.mock.lastCall![0]).toMatchObject({
      coherent: true,
      fromCache: false,
      hasPendingWrites: false,
    });
    expect(
      await next.mock.lastCall![0].repository.loadContext(['alice']),
    ).toEqual([expect.objectContaining(fact)]);
    expect(fail).not.toHaveBeenCalled();
    stop();
  },
);
it.each(['fromCache', 'hasPendingWrites'] as const)(
  'ORs %s across listeners until the last contribution clears',
  (flag) => {
    const next = vi.fn(),
      fail = vi.fn();
    const stop = subscribeAuthorizedReport(
      db,
      'viewer',
      next,
      fail,
      ['a'],
      range,
    );
    const snapshots = coherentSnapshots();
    snapshots.forEach((snapshot, i) =>
      mock.listeners[i].next({
        ...snapshot,
        metadata: {
          fromCache: false,
          hasPendingWrites: false,
          [flag]: i === 0 || i === 4,
        },
      }),
    );
    const expected = {
      coherent: true,
      fromCache: false,
      hasPendingWrites: false,
    };
    expect(next.mock.lastCall![0]).toMatchObject({ ...expected, [flag]: true });
    mock.listeners[0].next(snapshots[0]);
    expect(next.mock.lastCall![0]).toMatchObject({ ...expected, [flag]: true });
    mock.listeners[4].next(snapshots[4]);
    expect(next.mock.lastCall![0]).toMatchObject(expected);
    expect(fail).not.toHaveBeenCalled();
    stop();
  },
);
it('drops removed group metadata and fences stale next callbacks across readdition', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  const stop = subscribeAuthorizedReport(
    db,
    'viewer',
    next,
    fail,
    ['a'],
    range,
  );
  const snapshots = coherentSnapshots();
  snapshots.forEach((snapshot, i) =>
    mock.listeners[i].next({
      ...snapshot,
      metadata: { fromCache: i >= 3, hasPendingWrites: i >= 3 },
    }),
  );
  const oldGroup = mock.listeners.slice(3);
  expect(next.mock.lastCall![0]).toMatchObject({
    coherent: true,
    fromCache: true,
    hasPendingWrites: true,
  });
  mock.listeners[2].next({
    exists: () => false,
    data: () => ({}),
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  const expected = {
    coherent: true,
    fromCache: false,
    hasPendingWrites: false,
  };
  expect(next.mock.lastCall![0]).toMatchObject(expected);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  expect([...next.mock.lastCall![0].repository.projects.keys()]).toEqual([]);
  const deliverStale = () => {
    const count = next.mock.calls.length;
    for (const listener of oldGroup) {
      expect(listener.stop).toHaveBeenCalledOnce();
      listener.next(batch([record()], true, true));
    }
    expect(next).toHaveBeenCalledTimes(count);
    expect(next.mock.lastCall![0]).toMatchObject(expected);
  };
  deliverStale();
  expect(mock.listeners).toHaveLength(6);
  mock.listeners[2].next(snapshots[2]);
  const currentGroup = mock.listeners.slice(6);
  expect(currentGroup).toHaveLength(3);
  const updated = record({ ...fact, endedAt: '2026-10-08T14:00:00Z' });
  for (const listener of currentGroup) listener.next(batch([updated]));
  deliverStale();
  expect(mock.listeners).toHaveLength(9);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([expect.objectContaining({ endedAt: '2026-10-08T14:00:00Z' })]);
  for (const listener of currentGroup)
    expect(listener.stop).not.toHaveBeenCalled();
  expect(fail).not.toHaveBeenCalled();
  stop();
});
it('tears down populated pending listeners on permission failure and ignores all delayed callbacks', () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail, ['a'], range);
  const snapshots = [
    catalog([['a', { type: 'work', topics: [] }]]),
    catalog([]),
    parent({ type: 'work', topics: [] }),
    batch([record()]),
    batch([record()], false, true),
    batch([record()]),
  ];
  snapshots.forEach((snapshot, i) => mock.listeners[i].next(snapshot));
  expect(next.mock.lastCall![0]).toMatchObject({
    coherent: true,
    hasPendingWrites: true,
  });
  const oldListeners = mock.listeners.slice(),
    count = next.mock.calls.length;
  const denied = new Error('permission-denied');
  oldListeners[4].fail(denied);
  expect(fail).toHaveBeenCalledExactlyOnceWith(denied);
  for (const listener of oldListeners)
    expect(listener.stop).toHaveBeenCalledOnce();
  oldListeners[0].next(catalog([['late-work', { type: 'work', topics: [] }]]));
  oldListeners.forEach((listener, i) => {
    listener.next(snapshots[i]);
    listener.fail(new Error('delayed permission-denied'));
  });
  expect(next).toHaveBeenCalledTimes(count);
  expect(fail).toHaveBeenCalledOnce();
  expect(mock.listeners).toHaveLength(oldListeners.length);
  for (const listener of oldListeners)
    expect(listener.stop).toHaveBeenCalledOnce();
});
it.each([
  ['full context', 0],
  ['started selection', 1],
  ['ended selection', 2],
])(
  'ignores retired %s failure after parent removal and readdition but fails closed for current listeners',
  async (_label, index) => {
    const next = vi.fn(),
      fail = vi.fn();
    subscribeAuthorizedReport(db, 'viewer', next, fail, ['a'], range);
    mock.listeners[0].next(catalog([['a', { type: 'work', topics: [] }]]));
    mock.listeners[1].next(catalog([]));
    mock.listeners[2].next(parent({ type: 'work', topics: [] }));
    const oldGroup = mock.listeners.slice(3),
      oldFail = oldGroup[index].fail;
    expect(oldGroup).toHaveLength(3);
    for (const listener of oldGroup) listener.next(batch([record()]));
    mock.listeners[2].next({
      exists: () => false,
      data: () => ({}),
      metadata: { fromCache: false, hasPendingWrites: false },
    });
    for (const listener of oldGroup)
      expect(listener.stop).toHaveBeenCalledOnce();
    expect(
      await next.mock.lastCall![0].repository.loadContext(['alice']),
    ).toEqual([]);
    mock.listeners[2].next(parent({ type: 'work', topics: [] }));
    const currentGroup = mock.listeners.slice(6);
    expect(currentGroup).toHaveLength(3);
    for (const listener of currentGroup) listener.next(batch([record()]));
    const count = next.mock.calls.length;
    oldFail(new Error('retired permission-denied'));
    expect(fail).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(count);
    for (const listener of currentGroup)
      expect(listener.stop).not.toHaveBeenCalled();
    const updated = record({ ...fact, endedAt: '2026-10-08T14:00:00Z' });
    for (const listener of currentGroup) listener.next(batch([updated]));
    expect(next.mock.calls.length).toBeGreaterThan(count);
    expect(next.mock.lastCall![0].coherent).toBe(true);
    expect(
      await next.mock.lastCall![0].repository.loadContext(['alice']),
    ).toEqual([expect.objectContaining({ endedAt: '2026-10-08T14:00:00Z' })]);
    const denied = new Error('current permission-denied'),
      finalCount = next.mock.calls.length;
    currentGroup[index].fail(denied);
    expect(fail).toHaveBeenCalledExactlyOnceWith(denied);
    for (const listener of mock.listeners)
      expect(listener.stop).toHaveBeenCalledOnce();
    for (const listener of currentGroup) {
      listener.next(batch([record()]));
      listener.fail(new Error('delayed permission-denied'));
    }
    expect(next).toHaveBeenCalledTimes(finalCount);
    expect(fail).toHaveBeenCalledOnce();
  },
);
it('explicit parent revocation overrides stale work catalog regardless callback order', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribeAuthorizedReport(db, 'viewer', next, fail, ['a']);
  const parent = (data: Record<string, unknown>) => ({
    exists: () => true,
    data: () => data,
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  mock.listeners[2].next(parent({ type: 'work', topics: [] }));
  mock.listeners[0].next(catalog([['a', { type: 'work', topics: [] }]]));
  mock.listeners[1].next(catalog([]));
  mock.listeners[3].next(batch([record()]));
  mock.listeners[2].next(
    parent({ type: 'personal', createdBy: 'other', topics: [] }),
  );
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  expect(mock.listeners[3].stop).toHaveBeenCalledOnce();
  mock.listeners[0].next(catalog([['a', { type: 'work', topics: [] }]]));
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
});
