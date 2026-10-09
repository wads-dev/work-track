import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { createRequire } from 'node:module';
const releaseRequire = createRequire(
  new URL(
    '../.release/pending/apps/backend/lib/modules/registration/infrastructure/firestore-project-management.js',
    import.meta.url,
  ),
);
const { Firestore } = releaseRequire('firebase-admin/firestore');
import { FirestoreProjectManagementRepository } from '../.release/pending/apps/backend/lib/modules/registration/infrastructure/firestore-project-management.js';
if (process.argv.slice(2).join(' ') !== '--confirm-local-demo')
  throw Error('Requires explicit --confirm-local-demo');
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
  throw Error('Only local8081');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
const app = initializeApp(
  {
    projectId: 'demo-work-track',
    credential: {
      getAccessToken: () =>
        Promise.resolve({ access_token: 'owner', expires_in: 3600 }),
    },
  },
  'owner-merge-probe',
);
const db = new Firestore({
  projectId: 'demo-work-track',
  host: '127.0.0.1:8081',
  ssl: false,
  credentials: {
    client_email: 'local@demo-work-track.iam.gserviceaccount.com',
    private_key: 'local-emulator-only',
  },
});
const prefix = 'merge-probe-' + randomUUID(),
  owner = prefix + '-owner',
  foreign = prefix + '-foreign',
  source = prefix + '-source',
  target = prefix + '-target',
  requestId = prefix + '-intent',
  jobId = createHash('sha256')
    .update(owner + ':' + requestId)
    .digest('hex');
const roots = [
  db.doc('projects/' + source),
  db.doc('projects/' + target),
  db.doc('users/' + owner),
  db.doc('users/' + foreign),
  db.doc('project_merge_jobs/' + jobId),
];
const base = {
  type: 'personal',
  createdBy: owner,
  title: 'Isolated merge probe',
  description: 'Temporary local-only owner query regression',
  createdAt: new Date().toISOString(),
  topics: [{ id: 'general', title: 'Geral', description: 'Default' }],
};
let cleanedDocs = 0;
try {
  const batch = db.batch();
  batch.create(roots[0], { ...base, id: source });
  batch.create(roots[1], { ...base, id: target });
  for (let i = 0; i < 101; i++)
    batch.create(db.doc('users/' + owner + '/records/r' + i), {
      uid: owner,
      projectId: source,
      topics: [{ topicId: 'general' }],
      originalText: 'owner-evidence',
      recordedAt: 'immutable',
    });
  const foreignRef = db.doc('users/' + foreign + '/records/foreign'),
    spoofRef = db.doc('users/' + owner + '/records/spoof');
  const foreignFact = {
    uid: foreign,
    projectId: source,
    topics: [{ topicId: 'general' }],
    originalText: 'foreign-evidence',
  };
  batch.create(foreignRef, foreignFact);
  batch.create(spoofRef, { ...foreignFact, originalText: 'spoof-evidence' });
  await batch.commit();
  const repo = new FirestoreProjectManagementRepository(db);
  const input = {
    sourceProjectId: source,
    targetProjectId: target,
    confirmed: false,
  };
  const preview = await repo.mergeProjects(input, owner);
  assert.equal(preview.count, 101);
  const execute = {
    ...input,
    confirmed: true,
    requestId,
    reason: 'Explicit local regression probe',
  };
  const first = await repo.mergeProjects(execute, owner);
  assert.equal(first.migratedCount, 100);
  const second = await repo.mergeProjects(execute, owner);
  assert.equal(second.migratedCount, 101);
  assert.equal(second.status, 'completed');
  assert.deepEqual(await repo.mergeProjects(execute, owner), second);
  assert.deepEqual((await foreignRef.get()).data(), foreignFact);
  assert.deepEqual((await spoofRef.get()).data(), {
    ...foreignFact,
    originalText: 'spoof-evidence',
  });
  const owned = await db
    .collection('users/' + owner + '/records')
    .where('projectId', '==', target)
    .where('uid', '==', owner)
    .get();
  assert.equal(owned.size, 101);
  console.log(
    JSON.stringify({
      status: 'PASS',
      project: 'demo-work-track',
      host: '127.0.0.1:8081',
      prefix,
      preview: preview.count,
      batches: [first.migratedCount, second.migratedCount],
      foreignUnchanged: true,
      spoofUnchanged: true,
      compiledRelease: true,
    }),
  );
} finally {
  async function count(ref) {
    let n = (await ref.get()).exists ? 1 : 0;
    for (const c of await ref.listCollections())
      for (const d of (await c.get()).docs) n += await count(d.ref);
    return n;
  }
  for (const root of roots) {
    cleanedDocs += await count(root);
    await db.recursiveDelete(root);
  }
  console.log(JSON.stringify({ cleanedDocs, prefix }));
  await deleteApp(app);
}
