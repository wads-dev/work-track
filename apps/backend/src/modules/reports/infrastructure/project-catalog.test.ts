import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { AdminReadAdapter } from '../../../infrastructure/firebase/admin-read-adapter.js';
import { readProjectCatalog, selectReportRecords } from './project-catalog.js';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';

it('Admin adapter maps getAll snapshots, skips data on missing documents and performs no empty read', async () => {
  const missingData = vi.fn(() => ({ stale: true }));
  const getAll = vi.fn().mockResolvedValue([
    { id: 'one', exists: true, data: () => ({ value: 'current' }) },
    { id: 'missing', exists: false, data: missingData },
  ]);
  const doc = vi.fn((id: string) => ({ id }));
  const collection = vi.fn(() => ({ doc }));
  const adapter = new AdminReadAdapter({
    getAll,
    collection,
  } as unknown as Firestore);
  expect(await adapter.getMany('projects', ['one', 'missing'])).toEqual([
    { id: 'one', data: { value: 'current' } },
    { id: 'missing', data: undefined },
  ]);
  expect(collection).toHaveBeenCalledWith('projects');
  expect(getAll).toHaveBeenCalledExactlyOnceWith(
    { id: 'one' },
    { id: 'missing' },
  );
  expect(missingData).not.toHaveBeenCalled();
  expect(await adapter.getMany('projects', [])).toEqual([]);
  expect(getAll).toHaveBeenCalledOnce();
  getAll.mockRejectedValue(new Error('unavailable'));
  await expect(adapter.getMany('projects', ['one'])).rejects.toThrow(
    'unavailable',
  );
});

it('Admin catalog uses100-document batches, preserves archive metadata and rejects invalid types without repairing topics', async () => {
  const metadata = new Map<string, Record<string, unknown>>([
    [
      'legacy',
      {
        archived: 'legacy',
        mergedInto: 'target',
        topics: [{ id: 't', title: 'Title', extra: 'strip' }],
      },
    ],
    [
      'invalid',
      { type: null, topics: [{ id: 't', title: 'Title' }, { id: 'invalid' }] },
    ],
    ['private', { type: 'personal', createdBy: 'bob' }],
  ]);
  const getAll = vi.fn((...refs: { id: string }[]) =>
    Promise.resolve(
      refs.map(({ id }) => ({
        id,
        exists: metadata.has(id),
        data: () => metadata.get(id),
      })),
    ),
  );
  const db = {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    getAll,
  } as unknown as Firestore;
  const ids = [
    'legacy',
    'invalid',
    'private',
    ...Array.from({ length: 101 }, (_, i) => 'missing' + i),
  ];
  const catalog = await readProjectCatalog(db, [...ids, 'legacy']);
  expect(getAll.mock.calls.map((batch) => batch.length)).toEqual([100, 4]);
  expect(catalog.size).toBe(3);
  expect(catalog.get('legacy')).toMatchObject({
    archived: true,
    mergedInto: 'target',
    topics: [{ id: 't', title: 'Title' }],
  });
  expect(catalog.get('invalid')).toMatchObject({
    type: '__invalid__',
    topics: [],
  });
  const records = ['legacy', 'invalid', 'private'].map((projectId) => ({
    id: projectId,
    uid: 'alice',
    projectId,
    startedAt: 'legacy',
    timeZone: 'UTC',
    topics: [],
  }));
  const tombstone = {
    ...records[0],
    id: 'removed',
    deletedAt: 'legacy',
  } as ReportSourceRecord;
  expect(
    selectReportRecords([...records, tombstone], catalog, {
      viewerUid: 'alice',
    }).map((r) => r.id),
  ).toEqual(['legacy']);
  expect(
    selectReportRecords(records, catalog, { companyOnly: true }).map(
      (r) => r.id,
    ),
  ).toEqual(['legacy']);
});
