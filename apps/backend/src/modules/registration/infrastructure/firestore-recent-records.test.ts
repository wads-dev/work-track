import { expect, it, vi } from 'vitest';
import { Firestore, Query, type QuerySnapshot } from 'firebase-admin/firestore';
import {
  recentRecordQueries,
  readRecentRecordCandidates,
} from './firestore-recent-records.js';

const db = new Firestore({ projectId: 'demo-recent-native-query' });
const now = new Date('2026-10-11T03:00:00Z');
function structuredQuery(query: Query) {
  return (
    query as Query & {
      toProto(): { structuredQuery: Record<string, unknown> };
    }
  ).toProto().structuredQuery;
}
const fieldFilter = (fieldPath: string, op: string, value: string) => ({
  fieldFilter: { field: { fieldPath }, op, value: { stringValue: value } },
});

it('serializes exact owner/period predicates with date-first physical orders in the actual SDK', () => {
  const branches = recentRecordQueries(
    db.collection('users/alice/records'),
    'alice',
    24,
    now,
  );
  const native = branches.map(({ query }) =>
    structuredQuery(query.limit(2001)),
  );
  const base = [
    fieldFilter('uid', 'EQUAL', 'alice'),
    fieldFilter('startedAt', 'LESS_THAN', '2026-10-13'),
  ];
  for (const [index, proto] of native.entries()) {
    expect(proto.where).toEqual({
      compositeFilter: {
        op: 'AND',
        filters: [
          ...base,
          [
            fieldFilter('startedAt', 'GREATER_THAN_OR_EQUAL', '2026-10-08'),
            fieldFilter('endedAt', 'GREATER_THAN_OR_EQUAL', '2026-10-08'),
            fieldFilter('startedAt', 'LESS_THAN', '2026-10-08'),
          ][index],
        ],
      },
    });
    expect(proto.orderBy).toEqual([
      ...(index === 1
        ? [{ field: { fieldPath: 'endedAt' }, direction: 'ASCENDING' }]
        : []),
      { field: { fieldPath: 'startedAt' }, direction: 'ASCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
    ]);
    expect(proto.startAt).toBeUndefined();
    expect(proto.limit).toEqual({ value: 2001 });
  }
  expect(branches.map(({ oldOpenOnly }) => oldOpenOnly)).toEqual([
    false,
    false,
    true,
  ]);
});

it('pads bounds so opposite-offset starts and overlap ends are never lost', () => {
  const native = recentRecordQueries(
    db.collection('users/alice/records'),
    'alice',
    24,
    now,
  );
  const startedAt = '2026-10-09T03:01:00-23:59';
  const endedAt = '2026-10-09T03:01:00-23:59';
  expect(Date.parse(startedAt)).toBeGreaterThanOrEqual(
    now.getTime() - 24 * 3600000,
  );
  expect(startedAt >= '2026-10-08' && startedAt < '2026-10-13').toBe(true);
  expect(endedAt >= '2026-10-08').toBe(true);
  expect('2026-10-12T02:59:00+23:59' < '2026-10-13').toBe(true);
  expect(native).toHaveLength(3);
  expect(() =>
    recentRecordQueries(
      db.collection('users/alice/records'),
      'alice',
      720,
      new Date('0000-01-01T00:00:00Z'),
    ),
  ).not.toThrow();
});

function stubBranchReads(
  batches: Array<Array<Record<string, unknown> & { id: string }>>,
) {
  const limits: number[] = [];
  let branch = 0;
  const get = vi.spyOn(Query.prototype, 'get').mockImplementation(function (
    this: Query,
  ) {
    const limit = (structuredQuery(this).limit as { value: number }).value;
    limits.push(limit);
    const records = batches[branch++] ?? [];
    const docs = records
      .slice(0, limit)
      .map(({ id, ...data }) => ({ id, data: () => data }));
    return Promise.resolve({ docs } as unknown as QuerySnapshot);
  });
  return { limits, get };
}

it('deduplicates physical IDs and retains only missing/null-ended old-start residuals', async () => {
  const duplicate = { id: 'recent', startedAt: '2026-10-11T00:00:00Z' };
  const reads = stubBranchReads([
    [duplicate],
    [duplicate, { id: 'span', endedAt: '2026-10-11T00:00:00Z' }],
    [
      { id: 'legacy-open' },
      { id: 'null-open', endedAt: null },
      { id: 'old-closed', endedAt: '2026-10-02T00:00:00Z' },
    ],
  ]);
  try {
    const records = await readRecentRecordCandidates(
      db.collection('users/alice/records'),
      'alice',
      24,
      now,
    );
    expect(records.map(({ id }) => id)).toEqual([
      'recent',
      'span',
      'legacy-open',
      'null-open',
    ]);
    expect(reads.limits).toEqual([2001, 2000, 1998]);
  } finally {
    reads.get.mockRestore();
  }
});

it.each([0, 1, 2])(
  'fails explicitly when native branch %i exhausts the shared physical budget',
  async (overflowBranch) => {
    const batches = [[], [], []] as Array<
      Array<Record<string, unknown> & { id: string }>
    >;
    for (let index = 0; index < overflowBranch; index++)
      batches[index] = [{ id: 'duplicate' }];
    batches[overflowBranch] = Array.from({ length: 2001 }, (_, index) => ({
      id: 'row-' + index,
    }));
    const reads = stubBranchReads(batches);
    try {
      await expect(
        readRecentRecordCandidates(
          db.collection('users/alice/records'),
          'alice',
          24,
          now,
        ),
      ).rejects.toMatchObject({ code: 'resource-exhausted' });
      expect(reads.get).toHaveBeenCalledTimes(overflowBranch + 1);
      expect(reads.limits.at(-1)).toBe(2001 - overflowBranch);
    } finally {
      reads.get.mockRestore();
    }
  },
);

it('accepts exactly 2000 physical reads only after empty overflow probes prove later branches complete', async () => {
  const reads = stubBranchReads([
    Array.from({ length: 2000 }, (_, index) => ({ id: 'row-' + index })),
    [],
    [],
  ]);
  try {
    expect(
      await readRecentRecordCandidates(
        db.collection('users/alice/records'),
        'alice',
        24,
        now,
      ),
    ).toHaveLength(2000);
    expect(reads.limits).toEqual([2001, 1, 1]);
  } finally {
    reads.get.mockRestore();
  }
});
