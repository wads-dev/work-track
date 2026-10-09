import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingReadyIndex } from './wait-firestore-indexes.mjs';
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
