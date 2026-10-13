import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { registerInput } from '@work-track/core/registration/domain/work-model';
import {
  compareReportDocuments,
  nextReportCursor,
  orderReportQuery,
  reportUpperDatePrefix,
  resumeReportQuery,
} from './admin-report-query.js';

const db = new Firestore({ projectId: 'demo-report-native-query' });
// Use the actual SDK serializer, not a mock that accepts impossible query/cursor shapes.
function structuredQuery(query: Query) {
  return (
    query as Query & {
      toProto(): { structuredQuery: Record<string, unknown> };
    }
  ).toProto().structuredQuery;
}

it.each(['collection', 'collectionGroup'] as const)(
  'serializes a %s date inequality with date-first ordering and a complete two-value cursor',
  (scope) => {
    const upper = reportUpperDatePrefix({ to: '2026-10-09T00:00:00Z' });
    const base =
      scope === 'collection'
        ? db.collection('users/alice/records')
        : db.collectionGroup('records');
    const ordered = orderReportQuery(base.where('projectId', '==', 'p'), upper);
    const doc = {
      id: 'a',
      ref: db.doc('users/alice/records/a'),
      data: () => ({ startedAt: '2026-10-08T12:00:00+23:00' }),
    } as unknown as QueryDocumentSnapshot;
    const cursor = nextReportCursor(doc, upper, scope === 'collectionGroup')!;
    const resumed = resumeReportQuery(
      ordered,
      cursor,
      upper,
      scope === 'collectionGroup' ? (key) => db.doc(key) : undefined,
    );
    const proto = structuredQuery(resumed.limit(101));
    expect(proto.orderBy).toEqual([
      { field: { fieldPath: 'startedAt' }, direction: 'ASCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
    ]);
    expect(proto.startAt).toEqual({
      values: [
        { stringValue: '2026-10-08T12:00:00+23:00' },
        {
          referenceValue:
            'projects/demo-report-native-query/databases/(default)/documents/users/alice/records/a',
        },
      ],
    });
    expect(proto.where).toMatchObject({
      compositeFilter: {
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'projectId' },
              op: 'EQUAL',
              value: { stringValue: 'p' },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'startedAt' },
              op: 'LESS_THAN',
              value: { stringValue: '2026-10-11' },
            },
          },
        ],
      },
    });
    expect(() => resumeReportQuery(ordered, cursor, '2026-10-12')).toThrow(
      'Invalid dated report cursor',
    );
    expect(() => resumeReportQuery(ordered, 'a', upper)).toThrow(
      'Invalid dated report cursor',
    );
  },
);

it('keeps ID-only cursor/query behavior unchanged without a to bound', () => {
  const base = orderReportQuery(db.collection('users/alice/records'));
  const proto = structuredQuery(resumeReportQuery(base, 'old', undefined));
  expect(proto.orderBy).toEqual([
    { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
  ]);
  expect(proto.where).toBeUndefined();
  expect(proto.startAt).toMatchObject({
    values: [
      {
        referenceValue:
          'projects/demo-report-native-query/databases/(default)/documents/users/alice/records/old',
      },
    ],
  });
  expect(
    reportUpperDatePrefix({ from: '2026-10-08T00:00:00Z' }),
  ).toBeUndefined();
  expect(() => reportUpperDatePrefix({ to: 'bad' })).toThrow(
    'Invalid report period',
  );
});

it.each(['-23:59', '+23:59'])(
  'covers valid write-schema %s offsets rather than assuming +/-14 hours',
  (offset) => {
    const to = '2026-10-09T00:00:00Z';
    const startedAt =
      '2026-10-' + (offset[0] === '+' ? '09T23:58:00' : '07T00:01:00') + offset;
    expect(registerInput.shape.startedAt.safeParse(startedAt).success).toBe(
      true,
    );
    expect(Date.parse(startedAt)).toBeLessThan(Date.parse(to));
    expect(startedAt < reportUpperDatePrefix({ to })!).toBe(true);
  },
);

it('keeps the upper candidate guard safe across year boundaries', () => {
  expect(reportUpperDatePrefix({ to: '2026-12-31T00:00:00Z' })).toBe(
    '2027-01-02',
  );
  expect(reportUpperDatePrefix({ to: '9999-12-31T00:00:00Z' })).toBe('\uf8ff');
});

it('declares every UID/project/date query index and preserves collection-scope single indexes', () => {
  const config = JSON.parse(
    readFileSync(
      new URL('../../../../../../firestore.indexes.json', import.meta.url),
      'utf8',
    ),
  ) as {
    indexes: {
      collectionGroup: string;
      queryScope: string;
      fields: { fieldPath: string; order: string }[];
    }[];
    fieldOverrides: {
      collectionGroup: string;
      fieldPath: string;
      indexes: { queryScope: string; order: string }[];
    }[];
  };
  for (const queryScope of ['COLLECTION', 'COLLECTION_GROUP']) {
    for (const fields of [
      ['projectId', 'uid'],
      ['uid', 'startedAt'],
      ['projectId', 'uid', 'startedAt'],
      ['projectId', 'startedAt'],
    ]) {
      expect(config.indexes).toContainEqual({
        collectionGroup: 'records',
        queryScope,
        fields: fields.map((fieldPath) => ({ fieldPath, order: 'ASCENDING' })),
      });
    }
  }
  for (const fieldPath of ['projectId', 'uid', 'startedAt']) {
    expect(config.fieldOverrides).toContainEqual({
      collectionGroup: 'records',
      fieldPath,
      indexes: [
        { order: 'ASCENDING', queryScope: 'COLLECTION' },
        { order: 'DESCENDING', queryScope: 'COLLECTION' },
        { order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' },
      ],
    });
  }
});

it('merges equal date keys in Firestore path-segment order, not concatenated path order', () => {
  const make = (path: string) =>
    ({
      ref: { path },
      data: () => ({ startedAt: '2026-10-08T10:00:00Z' }),
    }) as unknown as QueryDocumentSnapshot;
  const a = make('users/u/records/a');
  const b = make('users/u-/records/a');
  // '/' sorts after '-', but Firestore compares UID segments first: 'u' < 'u-'.
  expect(a.ref.path > b.ref.path).toBe(true);
  expect(compareReportDocuments(a, b)).toBeLessThan(0);
  expect(compareReportDocuments(a, b, '2026-10-11')).toBeLessThan(0);
});
