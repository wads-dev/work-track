import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  retirementPlan,
  retiredCallables,
  main,
} from './retire-unused-callables.mjs';
test('retirement is limited to the five exact names and region; reruns skip absent functions', () => {
  const inventory = [
    ...retiredCallables.map((id) => ({ id, region: 'southamerica-east1' })),
    { id: 'api', region: 'southamerica-east1' },
    { id: 'mcp', region: 'southamerica-east1' },
    { id: 'moveSubject', region: 'southamerica-east1' },
    { id: 'getProjectReport', region: 'us-central1' },
  ];
  assert.deepEqual(retirementPlan(inventory), [...retiredCallables].sort());
  assert.deepEqual(retirementPlan([]), []);
  assert.throws(() => retirementPlan({}));
  assert.throws(() => main(['--force']));
});
