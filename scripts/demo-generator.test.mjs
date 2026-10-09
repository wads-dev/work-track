import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const run = (args = [], env = {}) =>
  spawnSync(process.execPath, ['scripts/design-demo.mjs', ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });
test('dry run returns counts without network/write', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    mode: 'DRY-RUN-NO-NETWORK',
    projectId: 'demo-work-track',
    projects: 7,
    records: 44,
    audits: 5,
    open: 2,
    uids: 2,
    dates: '2026-10-01..2026-10-09 America/Sao_Paulo',
    policy: 'create-only; no overwrite/delete/auth mutations; all synthetic',
  });
});
test('JSON deterministic 56 scoped documents and references', () => {
  const a = run(['--json']),
    b = run(['--json']);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout, b.stdout);
  const { projectId, docs } = JSON.parse(a.stdout);
  assert.equal(projectId, 'demo-work-track');
  assert.equal(docs.length, 56);
  assert.equal(new Set(docs.map(([p]) => p)).size, 56);
  const projects = new Set(
    docs.filter(([p]) => p.startsWith('projects/')).map(([, d]) => d.id),
  );
  for (const [path, d] of docs) {
    assert(
      path.startsWith('projects/design-demo-') || path.startsWith('users/'),
    );
    if (d.uid) assert(projects.has(d.projectId));
  }
  assert(
    !/oauthClients|oauthFlows|accessToken|refreshToken|passwordHash/.test(
      a.stdout,
    ),
  );
});
test('guards reject production env, unconfirmed writes, mutation JSON and unknown args', () => {
  for (const [args, env] of [
    [[], { GCLOUD_PROJECT: 'production' }],
    [[], { FIRESTORE_EMULATOR_HOST: 'example.com:8081' }],
    [[], { FIREBASE_AUTH_EMULATOR_HOST: 'example.com:9099' }],
    [['--write'], {}],
    [['--write', '--confirm-local-demo', '--json'], {}],
    [['--unknown'], {}],
  ]) {
    const r = run(args, env);
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
  }
});
