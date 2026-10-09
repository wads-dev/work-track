// Lead-authorized local synthetic UI fixture only. No production, export, restart or build.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const marker = 'lead-ui-privacy-demo';
const uid = '35DvlWmc9p9KBKl6KD6i41aVGHPT';
const projectId = 'demo-work-track';
const projectPath = 'projects/' + marker;
const recordPath = 'users/' + uid + '/records/' + marker + '-closed-60m';
const args = process.argv.slice(2);
assert(
  args.every((a) =>
    ['--seed', '--cleanup', '--confirm-local-demo'].includes(a),
  ),
  'Unknown argument',
);
assert(
  !(args.includes('--seed') && args.includes('--cleanup')),
  'Choose seed OR cleanup',
);
const mutate = args.includes('--seed') || args.includes('--cleanup');
assert(
  !mutate || args.includes('--confirm-local-demo'),
  'Explicit local demo confirmation required',
);
const expected = {
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  FIREBASE_PROJECT_ID: projectId,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
};
for (const [key, value] of Object.entries(expected))
  assert(
    !process.env[key] || process.env[key] === value,
    'Refused conflicting ' + key,
  );
assert(!process.env.GOOGLE_APPLICATION_CREDENTIALS, 'Refused credential file');
assert(
  !process.env.FIREBASE_CONFIG ||
    JSON.parse(process.env.FIREBASE_CONFIG).projectId === projectId,
  'Conflicting Firebase config',
);
const ledger = [projectPath, recordPath];
if (!mutate)
  console.log(
    JSON.stringify({
      mode: 'DRY-RUN-NO-NETWORK',
      projectId,
      uid,
      ledger,
      cleanup:
        'node scripts/privacy-ui-fixture.mjs --cleanup --confirm-local-demo',
    }),
  );
else {
  Object.assign(process.env, expected);
  const require = createRequire(
    new URL('../apps/backend/package.json', import.meta.url),
  );
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { Firestore } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');
  const app = initializeApp(
      {
        projectId,
        credential: {
          getAccessToken: () =>
            Promise.resolve({ access_token: 'owner', expires_in: 3600 }),
        },
      },
      marker,
    ),
    db = new Firestore({
      projectId,
      host: '127.0.0.1:8081',
      ssl: false,
      credentials: {
        client_email: 'local@demo-work-track.iam.gserviceaccount.com',
        private_key: 'local-emulator-only',
      },
    });
  try {
    const owner = await getAuth(app).getUser(uid);
    assert.equal(owner.uid, uid, 'Owner must already exist');
    const projectRef = db.doc(projectPath),
      recordRef = db.doc(recordPath);
    const topic = {
      id: 'general',
      title: 'Geral',
      description: 'Teste sintético local de isolamento pessoal.',
    };
    const project = {
      id: marker,
      title: 'Pessoal — prova UI de privacidade',
      description:
        'Projeto sintético local exclusivo para testar que o proprietário vê seu projeto pessoal e outro usuário não o vê.',
      type: 'personal',
      createdBy: uid,
      createdAt: '2026-10-09T06:00:00Z',
      topics: [topic],
      privacyFixtureMarker: marker,
    };
    const record = {
      id: marker + '-closed-60m',
      uid,
      projectId: marker,
      startedAt: '2026-10-08T15:00:00-03:00',
      endedAt: '2026-10-08T16:00:00-03:00',
      timeZone: 'America/Sao_Paulo',
      originalText: 'Teste privado sintético de uma hora, sem trabalho real.',
      interpretation:
        'Sessão sintética encerrada de 60 minutos para prova de isolamento pessoal na interface.',
      requestId: marker + '-closed-60m',
      receivedAt: '2026-10-09T06:00:00Z',
      topics: [{ topicId: 'general', percentage: 100 }],
      projectSnapshot: {
        title: project.title,
        description: project.description,
      },
      topicSnapshots: [topic],
      privacyFixtureMarker: marker,
    };
    await db.runTransaction(async (tx) => {
      const [p, r] = await Promise.all([tx.get(projectRef), tx.get(recordRef)]);
      if (args.includes('--seed')) {
        assert(
          !p.exists && !r.exists,
          'Collision: refuse all writes if either explicit document already exists',
        );
        tx.create(projectRef, project);
        tx.create(recordRef, record);
      } else {
        for (const snap of [p, r])
          if (snap.exists)
            assert.equal(
              snap.data().privacyFixtureMarker,
              marker,
              'Refused nonfixture document cleanup',
            );
        if (p.exists)
          assert.equal(p.data().createdBy, uid, 'Refused unexpected owner');
        if (r.exists) {
          assert.equal(r.data().uid, uid);
          assert.equal(r.data().projectId, marker);
        }
        if (r.exists) tx.delete(recordRef);
        if (p.exists) tx.delete(projectRef);
      }
    });
    console.log(
      JSON.stringify({
        mode: args.includes('--seed')
          ? 'SEEDED-LOCAL-2-DOCS'
          : 'CLEANED-LOCAL-EXPLICIT-LEDGER',
        projectId,
        uid,
        ledger,
        projectUiId: marker,
        closedMinutes: 60,
        cleanup:
          'node scripts/privacy-ui-fixture.mjs --cleanup --confirm-local-demo',
      }),
    );
  } finally {
    await deleteApp(app);
  }
}
