import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexesPath, matchingReadyIndex } from './wait-firestore-indexes.mjs';
test('index listing omits unsupported nonzero page size and preserves page tokens', () => {
  assert.equal(indexesPath('records'), '/collectionGroups/records/indexes');
  assert.equal(
    indexesPath('records', 'next/page+token='),
    '/collectionGroups/records/indexes?pageToken=next%2Fpage%2Btoken%3D',
  );
  for (const token of [undefined, '', 'next/page+token=']) {
    const url = new URL(
      indexesPath('records', token),
      'https://firestore.googleapis.com',
    );
    assert.equal(url.searchParams.has('pageSize'), false);
    assert.equal(url.searchParams.get('pageToken'), token || null);
  }
});
const required = {
  queryScope: 'COLLECTION',
  fields: [
    { fieldPath: 'projectId', order: 'ASCENDING' },
    { fieldPath: 'startedAt', order: 'ASCENDING' },
  ],
};
test('requires READY and exact scope and ordered fields, ignoring implicit document ID', () => {
  const actual = {
    ...required,
    state: 'READY',
    fields: [...required.fields, { fieldPath: '__name__', order: 'ASCENDING' }],
  };
  assert.equal(matchingReadyIndex(required, actual), true);
  assert.equal(
    matchingReadyIndex(required, {
      ...actual,
      fields: [
        { order: 'ASCENDING', fieldPath: 'projectId' },
        { order: 'ASCENDING', fieldPath: 'startedAt' },
        { order: 'ASCENDING', fieldPath: '__name__' },
      ],
    }),
    true,
  );
  assert.equal(
    matchingReadyIndex(required, {
      ...actual,
      fields: [
        { fieldPath: 'otherProjectId', order: 'ASCENDING' },
        required.fields[1],
      ],
    }),
    false,
  );
  assert.equal(
    matchingReadyIndex(required, {
      ...actual,
      fields: [
        { fieldPath: 'projectId', arrayConfig: 'CONTAINS' },
        required.fields[1],
      ],
    }),
    false,
  );
  assert.equal(
    matchingReadyIndex(required, { ...actual, state: 'CREATING' }),
    false,
  );
  assert.equal(
    matchingReadyIndex(required, { ...actual, queryScope: 'COLLECTION_GROUP' }),
    false,
  );
  assert.equal(
    matchingReadyIndex(required, {
      ...actual,
      fields: [...required.fields].reverse(),
    }),
    false,
  );
  assert.equal(
    matchingReadyIndex(required, {
      ...actual,
      fields: [
        { fieldPath: 'projectId', order: 'DESCENDING' },
        required.fields[1],
      ],
    }),
    false,
  );
});
