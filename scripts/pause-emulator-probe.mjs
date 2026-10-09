import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { FirestorePauseRepository } from '../apps/backend/lib/modules/pause/infrastructure/firestore-pause.js';
const require = createRequire(
  new URL(
    '../apps/backend/lib/modules/pause/infrastructure/firestore-pause.js',
    import.meta.url,
  ),
);
const { Firestore } = require('firebase-admin/firestore');
if (process.argv.slice(2).join(' ') !== '--confirm-local-demo')
  throw Error('Requires explicit local demo confirmation');
for (const key of [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GCLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
  'FIREBASE_CONFIG',
])
  if (process.env[key]) throw Error('Conflicting environment ' + key);
if (
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8081'
)
  throw Error('Only loopback8081');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
const db = new Firestore({
  projectId: 'demo-work-track',
  host: '127.0.0.1:8081',
  ssl: false,
  credentials: {
    client_email: 'local@demo-work-track.iam.gserviceaccount.com',
    private_key: 'local-emulator-only',
  },
});
const prefix = 'pause-probe-' + randomUUID(),
  uid = prefix + '-owner',
  projectId = prefix + '-project',
  sourceId = 'source',
  now = Date.parse('2026-10-09T12:00:00Z');
const project = db.doc('projects/' + projectId),
  user = db.doc('users/' + uid),
  sourceRef = user.collection('records').doc(sourceId),
  oldRef = user.collection('records').doc('old');
const source = {
  id: sourceId,
  uid,
  projectId,
  requestId: 'initial',
  startedAt: '2026-10-09T09:00:00Z',
  timeZone: 'UTC',
  originalText: 'Original immutable source',
  interpretation: 'Original work interpretation',
  receivedAt: '2026-10-09T09:00:01Z',
  topics: [{ topicId: 'general', percentage: 100 }],
  projectSnapshot: { title: 'Private probe' },
  topicSnapshots: [{ id: 'general', title: 'Geral' }],
};
const old = {
  ...source,
  id: 'old',
  requestId: 'old',
  startedAt: '2026-10-08T08:00:00Z',
};
let cleanedDocs = 0;
try {
  const batch = db.batch();
  batch.create(project, {
    id: projectId,
    type: 'personal',
    createdBy: uid,
    title: 'Private probe',
    topics: [{ id: 'general', title: 'Geral' }],
  });
  batch.create(sourceRef, source);
  batch.create(oldRef, old);
  await batch.commit();
  const repo = new FirestorePauseRepository(db);
  const input = {
    recordId: sourceId,
    resumedAt: '2026-10-09T12:00:00Z',
    durationMinutes: 60,
    requestId: prefix + '-intent',
    reason: 'Explicit local pause proof',
    originalUtterance: 'Pausei uma hora e retomei às 12h',
  };
  const result = await repo.registerPause(input, uid, now);
  const after = (await sourceRef.get()).data(),
    successor = (
      await user.collection('records').doc(result.successorRecordId).get()
    ).data(),
    audit = (
      await user.collection('pauseAudits').doc(result.auditId).get()
    ).data();
  assert.equal(after.endedAt, '2026-10-09T11:00:00.000Z');
  assert.equal(successor.startedAt, input.resumedAt);
  for (const key of [
    'originalText',
    'interpretation',
    'timeZone',
    'topics',
    'projectSnapshot',
    'topicSnapshots',
  ])
    assert.deepEqual(successor[key], source[key]);
  assert.equal(after.receivedAt, source.receivedAt);
  assert.equal(after.originalText, source.originalText);
  assert.equal(successor.pausedFrom, sourceId);
  assert.deepEqual(audit.beforeSource, source);
  assert.deepEqual(audit.afterSource, after);
  assert.deepEqual(audit.afterSuccessor, successor);
  assert.deepEqual(
    await repo.registerPause(input, uid, now + 25 * 3600000),
    result,
  );
  const beforeRecords = (await user.collection('records').get()).size,
    beforeAudit = (await user.collection('pauseAudits').get()).size;
  await assert.rejects(
    repo.registerPause(
      { ...input, recordId: 'old', requestId: prefix + '-old' },
      uid,
      now,
    ),
  );
  assert.deepEqual((await oldRef.get()).data(), old);
  assert.equal((await user.collection('records').get()).size, beforeRecords);
  assert.equal((await user.collection('pauseAudits').get()).size, beforeAudit);
  console.log(
    JSON.stringify({
      status: 'PASS',
      prefix,
      host: '127.0.0.1:8081',
      project: 'demo-work-track',
      sourceStart: '09:00Z',
      sourceEnd: '11:00Z',
      successorStart: '12:00Z',
      contextPreserved: true,
      immutableAudit: true,
      exactRetryAfter25h: true,
      oldSourceRejectedNoMutation: true,
    }),
  );
} finally {
  async function count(ref) {
    let n = (await ref.get()).exists ? 1 : 0;
    for (const c of await ref.listCollections())
      for (const d of (await c.get()).docs) n += await count(d.ref);
    return n;
  }
  for (const root of [project, user]) {
    cleanedDocs += await count(root);
    await db.recursiveDelete(root);
  }
  console.log(JSON.stringify({ prefix, cleanedDocs }));
  await db.terminate();
}
