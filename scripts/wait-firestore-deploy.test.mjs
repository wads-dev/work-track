import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  requiresFirestoreDeploy,
  deploymentState,
  waitForFirestoreDeploy,
} from './wait-firestore-deploy.mjs';
const success = {
  id: 1,
  head_sha: 'target',
  event: 'push',
  head_branch: 'main',
  status: 'completed',
  conclusion: 'success',
};
test('matches all and only Firestore workflow trigger paths across the whole push', () => {
  for (const path of [
    'firestore.rules',
    'firestore.indexes.json',
    'firebase.json',
    '.github/workflows/deploy-firestore.yml',
  ])
    assert.equal(
      requiresFirestoreDeploy(['apps/frontend/src/a.ts', path]),
      true,
    );
  assert.equal(
    requiresFirestoreDeploy([
      'apps/frontend/src/a.ts',
      'scripts/wait-firestore-deploy.mjs',
    ]),
    false,
  );
});
test('only exact SHA main push success passes; stale, missing and unfinished wait', () => {
  assert.equal(deploymentState([success], 'target'), 'success');
  for (const runs of [
    [],
    [{ ...success, head_sha: 'stale' }],
    [{ ...success, event: 'workflow_dispatch' }],
    [{ ...success, head_branch: 'other' }],
    [{ ...success, status: 'in_progress' }],
  ])
    assert.equal(deploymentState(runs, 'target'), 'pending');
});
test('latest matching failure or cancellation cannot be masked by old success', () => {
  for (const conclusion of [
    'failure',
    'cancelled',
    'timed_out',
    'skipped',
    'neutral',
  ])
    assert.throws(
      () =>
        deploymentState([success, { ...success, id: 2, conclusion }], 'target'),
      /failed/,
    );
  assert.equal(
    deploymentState(
      [success, { ...success, id: 2, status: 'queued' }],
      'target',
    ),
    'pending',
  );
});
test('bounded timeout rejects missing and stale runs', async () => {
  for (const runs of [[], [{ ...success, head_sha: 'stale' }]]) {
    let clock = 0;
    await assert.rejects(
      waitForFirestoreDeploy({
        sha: 'target',
        listRuns: async () => runs,
        timeoutMs: 20,
        intervalMs: 10,
        now: () => clock,
        pause: async (ms) => {
          clock += ms;
        },
      }),
      /Timed out/,
    );
    assert.equal(clock, 20);
  }
});
test('queued deployment can finish, API errors propagate without publishing', async () => {
  let calls = 0,
    clock = 0;
  await waitForFirestoreDeploy({
    sha: 'target',
    listRuns: async () => (++calls === 1 ? [] : [success]),
    timeoutMs: 20,
    intervalMs: 10,
    now: () => clock,
    pause: async (ms) => {
      clock += ms;
    },
  });
  assert.equal(calls, 2);
  const error = new Error('API denied');
  await assert.rejects(
    waitForFirestoreDeploy({
      sha: 'target',
      listRuns: async () => {
        throw error;
      },
    }),
    (caught) => caught === error,
  );
});
