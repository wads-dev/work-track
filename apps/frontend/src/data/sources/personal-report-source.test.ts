import { beforeEach, expect, it, vi } from 'vitest';
import type { PersonalReportSnapshot } from './personal-report-source';
interface MockSnapshot {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  docs?: { id: string; data: () => Record<string, unknown> }[];
  data?: () => Record<string, unknown>;
}

const listeners = vi.hoisted(
  () =>
    new Map<
      string,
      {
        next: (value: MockSnapshot) => void;
        error: (e: Error) => void;
        stop: ReturnType<typeof vi.fn>;
      }
    >(),
);
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  query: (path: string) => path,
  where: (...parts: unknown[]) => parts,
  and: (...parts: unknown[]) => parts,
  or: (...parts: unknown[]) => parts,
  onSnapshot: (
    ref: string,
    _options: unknown,
    next: (value: MockSnapshot) => void,
    error: (e: Error) => void,
  ) => {
    const stop = vi.fn();
    listeners.set(ref, { next, error, stop });
    return stop;
  },
}));
import { subscribePersonalReport } from './personal-report-source';
import type { Firestore } from 'firebase/firestore';
const metadata = (fromCache: boolean) => ({
  fromCache,
  hasPendingWrites: false,
});
const records = (fromCache: boolean) => ({
  metadata: metadata(fromCache),
  docs: [
    {
      id: 'r1',
      data: () => ({
        projectId: 'p1',
        startedAt: '2026-10-08T12:00:00Z',
        endedAt: '2026-10-08T13:00:00Z',
        timeZone: 'UTC',
        topics: [],
      }),
    },
  ],
});
const project = (fromCache: boolean) => ({
  metadata: metadata(fromCache),
  data: () => ({ type: 'work', topics: [] }),
});
beforeEach(() => listeners.clear());
it('personal listener filters metadata topics individually, preserves topic extras and defaults null record topics', async () => {
  const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
    fail = vi.fn();
  const stop = subscribePersonalReport({} as Firestore, 'alice', next, fail);
  const fact = {
    ...records(false).docs[0].data(),
    uid: 'untrusted',
    topics: null,
    originalText: 'private',
  };
  listeners
    .get('users/alice/records')!
    .next({ metadata: metadata(true), docs: [{ id: 'r1', data: () => fact }] });
  const topic = {
    id: 't',
    title: 'Title',
    mergedIntoTopicId: 42,
    custom: 'retained',
  };
  listeners.get('projects/p1')!.next({
    metadata: metadata(true),
    data: () => ({
      type: 'work',
      archived: 'legacy',
      topics: [topic, null, { id: 'bad' }],
      custom: 'strip',
    }),
  });
  const snapshot = next.mock.lastCall![0];
  expect(snapshot).toMatchObject({
    coherent: true,
    fromCache: true,
    hasPendingWrites: false,
  });
  expect(await snapshot.repository.loadContext(['alice'])).toEqual([
    expect.objectContaining({ uid: 'alice', topics: [] }),
  ]);
  expect(
    (await snapshot.repository.loadContext(['alice']))[0],
  ).not.toHaveProperty('originalText');
  expect(await snapshot.repository.readTopics(['p1'], 'alice')).toEqual({
    p1: [topic],
  });
  expect(await snapshot.repository.archivedProjectIds(['p1'])).toEqual(['p1']);
  expect(listeners.size).toBe(2);
  expect(fail).not.toHaveBeenCalled();
  expect(fact.topics).toBeNull();
  stop();
});
it.each([null, false, 0, {}, 'invalid'])(
  'invalid personal metadata type %s stays inaccessible',
  async (type) => {
    const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
      fail = vi.fn();
    const stop = subscribePersonalReport({} as Firestore, 'alice', next, fail);
    listeners.get('users/alice/records')!.next(records(false));
    listeners
      .get('projects/p1')!
      .next({ metadata: metadata(false), data: () => ({ type, topics: [] }) });
    expect(
      await next.mock.lastCall![0].repository.loadContext(['alice']),
    ).toEqual([]);
    expect(fail).not.toHaveBeenCalled();
    stop();
  },
);
it.each([
  [
    'negative topics',
    { topics: [{ topicId: 't', percentage: -1 }] },
    'tópicos inválidos',
  ],
  ['invalid path ID', { projectId: 'nested/project' }, 'registro inválido'],
])(
  'personal mode rejects %s before parent subscriptions without repairing persisted data',
  (_label, patch, error) => {
    const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
      fail = vi.fn();
    subscribePersonalReport({} as Firestore, 'alice', next, fail);
    const fact = { ...records(false).docs[0].data(), ...patch };
    listeners.get('users/alice/records')!.next({
      metadata: metadata(false),
      docs: [{ id: 'r1', data: () => fact }],
    });
    expect(fail.mock.lastCall![0].message).toContain(error);
    expect(listeners.size).toBe(1);
    expect(listeners.get('users/alice/records')!.stop).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  },
);
it('personal mode excludes tombstones before validation of legacy invalid fields', async () => {
  const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
    fail = vi.fn();
  const stop = subscribePersonalReport({} as Firestore, 'alice', next, fail);
  listeners.get('users/alice/records')!.next({
    metadata: metadata(false),
    docs: [
      {
        id: 'removed',
        data: () => ({ deletedAt: 'legacy', topics: 'invalid' }),
      },
    ],
  });
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  expect(listeners.size).toBe(1);
  expect(fail).not.toHaveBeenCalled();
  stop();
});
it('waits for project snapshots, exposes cache status, updates and disposes', async () => {
  const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
    fail = vi.fn();
  const stop = subscribePersonalReport({} as Firestore, 'alice', next, fail);
  listeners.get('users/alice/records')!.next(records(true));
  expect(next).not.toHaveBeenCalled();
  listeners.get('projects/p1')!.next(project(true));
  expect(next.mock.lastCall![0].fromCache).toBe(true);
  listeners.get('users/alice/records')!.next(records(false));
  expect(next.mock.lastCall![0].fromCache).toBe(true);
  listeners.get('projects/p1')!.next(project(false));
  expect(next.mock.lastCall![0].fromCache).toBe(false);
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['alice'])).length,
  ).toBe(1);
  listeners
    .get('users/alice/records')!
    .next({ metadata: metadata(false), docs: [] });
  expect(listeners.get('projects/p1')!.stop).toHaveBeenCalledTimes(1);
  expect(
    await next.mock.lastCall![0].repository.loadContext(['alice']),
  ).toEqual([]);
  stop();
  const count = next.mock.calls.length;
  listeners.get('users/alice/records')!.next(records(false));
  expect(next).toHaveBeenCalledTimes(count);
  expect(fail).not.toHaveBeenCalled();
});
it('fails closed on permission loss and stops all subscriptions', () => {
  const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
    fail = vi.fn();
  subscribePersonalReport({} as Firestore, 'alice', next, fail);
  listeners.get('users/alice/records')!.next(records(false));
  listeners.get('projects/p1')!.next(project(false));
  const error = new Error('permission-denied');
  listeners.get('users/alice/records')!.error(error);
  expect(fail).toHaveBeenCalledWith(error);
  for (const l of listeners.values()) expect(l.stop).toHaveBeenCalled();
  const count = next.mock.calls.length;
  listeners.get('projects/p1')!.next(project(false));
  expect(next).toHaveBeenCalledTimes(count);
});
it.each(['permission-denied', 'not-found'])(
  'excludes project %s, drops cached data, and keeps valid own projects live',
  async (code) => {
    const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
      fail = vi.fn();
    const stop = subscribePersonalReport({} as Firestore, 'alice', next, fail);
    const own = records(false).docs[0]!;
    const both = {
      metadata: metadata(false),
      docs: [
        own,
        { id: 'r2', data: () => ({ ...own.data(), projectId: 'p2' }) },
      ],
    };
    listeners.get('users/alice/records')!.next(both);
    const denied = listeners.get('projects/p1')!;
    denied.next(project(true));
    denied.error(Object.assign(new Error(code), { code }));
    expect(next).not.toHaveBeenCalled();
    const valid = listeners.get('projects/p2')!;
    valid.next({
      metadata: metadata(false),
      data: () => ({ type: 'personal', createdBy: 'alice', topics: [] }),
    });
    expect(next.mock.lastCall![0].fromCache).toBe(false);
    expect(
      (await next.mock.lastCall![0].repository.loadContext(['alice'])).map(
        (r) => r.id,
      ),
    ).toEqual(['r2']);
    const count = next.mock.calls.length;
    denied.next(project(false));
    denied.error(new Error('late callback'));
    expect(next).toHaveBeenCalledTimes(count);
    expect(fail).not.toHaveBeenCalled();
    valid.next(project(false));
    expect(next).toHaveBeenCalledTimes(count + 1);
    // Removing then returning a parent creates a new generation. Old callbacks
    // must not deny or repopulate the newly authorized subscription.
    listeners
      .get('users/alice/records')!
      .next({ metadata: metadata(false), docs: [both.docs[1]] });
    listeners.get('users/alice/records')!.next(both);
    const recovered = listeners.get('projects/p1')!;
    recovered.next({
      metadata: metadata(false),
      data: () => ({ type: 'personal', createdBy: 'alice', topics: [] }),
    });
    denied.error(Object.assign(new Error(code), { code }));
    denied.next(project(true));
    expect(
      (await next.mock.lastCall![0].repository.loadContext(['alice']))
        .map((r) => r.id)
        .sort(),
    ).toEqual(['r1', 'r2']);
    expect(next.mock.lastCall![0].fromCache).toBe(false);
    expect(fail).not.toHaveBeenCalled();
    stop();
  },
);
it('still disposes globally for other project listener errors', () => {
  const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
    fail = vi.fn();
  subscribePersonalReport({} as Firestore, 'alice', next, fail);
  listeners.get('users/alice/records')!.next(records(false));
  const error = Object.assign(new Error('unavailable'), {
    code: 'unavailable',
  });
  listeners.get('projects/p1')!.error(error);
  expect(fail).toHaveBeenCalledWith(error);
  for (const l of listeners.values()) expect(l.stop).toHaveBeenCalled();
});

it.each([undefined, null, '2026-10-08T13:00:00Z'])(
  'normalizes own persisted endedAt %s',
  async (endedAt) => {
    const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
      fail = vi.fn();
    const stop = subscribePersonalReport({} as Firestore, 'alice', next, fail);
    const fact = { ...records(false).docs[0].data(), endedAt };
    listeners.get('users/alice/records')!.next({
      metadata: metadata(false),
      docs: [{ id: 'r1', data: () => fact }],
    });
    listeners.get('projects/p1')!.next(project(false));
    expect(fail).not.toHaveBeenCalled();
    const context = await next.mock.lastCall![0].repository.loadContext([
      'alice',
    ]);
    expect(context).toHaveLength(1);
    expect(context[0]?.endedAt).toBe(endedAt ?? undefined);
    expect(fact.endedAt).toBe(endedAt);
    stop();
  },
);
