import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import type { WorkspaceSnapshot } from '../sync/workspace-sync';
const mocks = vi.hoisted(() => ({
  observe: vi.fn(),
  read: vi.fn(),
  stop: vi.fn(),
  next: null as null | ((snapshot: WorkspaceSnapshot) => void),
}));
vi.mock('../sync/workspace-runtime', () => ({
  observeWorkspace: mocks.observe,
}));
vi.mock(
  '../repositories/browser-listing-repository',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../repositories/browser-listing-repository')
      >();
    return { ...actual, readOwnRecordListing: mocks.read };
  },
);
import { subscribeAuthorizedOwnRecords as subscribe } from './authorized-own-record-source';
import { emptyListing } from '../repositories/browser-listing-repository';
const db = {} as Firestore;
const snapshot = (
  patch: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot => ({
  projects: [{ id: 'p', data: {} }],
  records: [],
  completedProjects: ['p'],
  complete: true,
  syncing: false,
  error: '',
  ...patch,
});
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.observe.mockImplementation(
    (_db: Firestore, _uid: string, next: typeof mocks.next) => {
      mocks.next = next;
      return mocks.stop;
    },
  );
  mocks.read.mockResolvedValue({
    ...emptyListing,
    rows: [{ id: 'queried', data: {} }],
    total: 1,
  });
});
it('uses workspace readiness only to trigger native repository selection and forwards parameters', async () => {
  const next = vi.fn();
  subscribe(db, 'alice', next, vi.fn(), {
    project: 'p',
    openOnly: true,
    size: 50,
    page: 2,
  });
  mocks.next!(snapshot());
  await flush();
  expect(mocks.read).toHaveBeenCalledWith(db, 'alice', new Set(['p']), {
    project: 'p',
    openOnly: true,
    size: 50,
    page: 2,
  });
  expect(next.mock.lastCall?.[0]).toMatchObject({
    rows: [{ id: 'queried' }],
    fromCache: false,
    total: 1,
  });
  expect(mocks.observe).toHaveBeenCalledOnce();
});
it('fences incomplete readiness instead of exposing global memory arrays', async () => {
  const next = vi.fn();
  subscribe(db, 'alice', next, vi.fn());
  mocks.next!(
    snapshot({
      complete: false,
      records: [{ path: 'users/alice/records/secret', data: {} }],
      projects: [{ id: 'stale', data: {} }],
    }),
  );
  expect(mocks.read).not.toHaveBeenCalled();
  expect(next.mock.lastCall?.[0]).toMatchObject({
    rows: [],
    fromCache: true,
    total: 0,
  });
});
it('drops cache query results superseded by ACL/account content changes or disposal', async () => {
  let resolve!: (value: typeof emptyListing) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const next = vi.fn();
  const stop = subscribe(db, 'alice', next, vi.fn());
  mocks.next!(snapshot());
  mocks.next!(snapshot({ complete: false, projects: [] }));
  resolve({ ...emptyListing, rows: [{ id: 'revoked', data: {} }] });
  await flush();
  expect(next.mock.lastCall?.[0].rows).toEqual([]);
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  mocks.next!(snapshot());
  stop();
  resolve({ ...emptyListing, rows: [{ id: 'late', data: {} }] });
  await flush();
  expect(next.mock.lastCall?.[0].rows).toEqual([]);
  expect(mocks.stop).toHaveBeenCalledOnce();
});
it('fails without publishing stale results and recovers on the next local content notification', async () => {
  const next = vi.fn(),
    fail = vi.fn();
  subscribe(db, 'alice', next, fail);
  mocks.next!(snapshot({ error: 'denied' }));
  expect(fail).toHaveBeenCalledOnce();
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.read.mockRejectedValueOnce(new Error('storage'));
  mocks.next!(snapshot());
  await flush();
  expect(fail).toHaveBeenCalledTimes(2);
  mocks.next!(snapshot());
  await flush();
  expect(next.mock.lastCall?.[0].rows).toHaveLength(1);
});

it('preserves queried data and avoids duplicate local reads on transport-only and audit notifications', async () => {
  const next = vi.fn();
  subscribe(db, 'alice', next, vi.fn());
  mocks.next!(snapshot());
  await flush();
  const before = next.mock.calls.length;
  mocks.next!(
    snapshot({
      syncing: true,
      audits: [{ path: 'users/alice/records/a/audit/x', data: {} }],
    }),
  );
  await flush();
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledTimes(before);
});
