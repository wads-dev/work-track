/** SOURCE-ONLY until Lead authorizes local runtime. No dependencies, deploy or restart. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const allowed = ['--run', '--confirm-local-demo'];
assert(
  process.argv.slice(2).every((a) => allowed.includes(a)),
  'Unknown argument',
);
const project = 'demo-work-track';
const expected = {
  GCLOUD_PROJECT: project,
  GOOGLE_CLOUD_PROJECT: project,
  FIREBASE_PROJECT_ID: project,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
};
for (const [key, value] of Object.entries(expected)) {
  assert(
    !process.env[key] || process.env[key] === value,
    'Conflicting environment: ' + key,
  );
}
assert(!process.env.GOOGLE_APPLICATION_CREDENTIALS, 'Refused credential file');
assert(
  !process.env.FIREBASE_CONFIG ||
    JSON.parse(process.env.FIREBASE_CONFIG).projectId === project,
  'Conflicting Firebase config',
);
const run = process.argv.includes('--run');
assert(
  !run || process.argv.includes('--confirm-local-demo'),
  'Explicit local confirmation required',
);
if (!run) {
  console.log(
    'SOURCE READY / DRY RUN: no imports of backend, network, emulator writes or credentials. Requires Lead runtime GO and --run --confirm-local-demo.',
  );
} else {
  Object.assign(process.env, expected);
  const marker = 'lead-privacy-probe-' + randomUUID();
  const require = createRequire(
    new URL('../apps/backend/package.json', import.meta.url),
  );
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');
  const app = initializeApp({ projectId: project }, marker),
    db = getFirestore(app),
    auth = getAuth(app);
  const { FirestoreWorkRepository } =
    await import('../apps/backend/lib/modules/registration/infrastructure/firestore-work.js');
  const { FirestoreRecordEditingRepository } =
    await import('../apps/backend/lib/modules/registration/infrastructure/firestore-record-editing.js');
  const { FirestoreProjectManagementRepository } =
    await import('../apps/backend/lib/modules/registration/infrastructure/firestore-project-management.js');
  const { FirestoreTopicManagementRepository } =
    await import('../apps/backend/lib/modules/registration/infrastructure/firestore-topic-management.js');
  const { registerWorkTools } =
    await import('../apps/backend/lib/modules/registration/presentation/work-tools.js');
  const repo = new FirestoreWorkRepository(db);
  const owned = new Set(),
    users = new Set();
  const sha = (text) => createHash('sha256').update(text).digest('hex');
  const title = marker + ' same title';
  let checks = 0;
  async function http(url, body, token) {
    assert(
      url.startsWith('http://127.0.0.1:9099/') ||
        url.startsWith('http://127.0.0.1:5001/' + project + '/'),
      'Nonlocal URL refused',
    );
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const callable = async (name, data, token) =>
    (
      await http(
        'http://127.0.0.1:5001/' + project + '/southamerica-east1/' + name,
        { data },
        token,
      )
    ).body;
  async function good(name, data, token) {
    const result = await callable(name, data, token);
    assert(!result.error, name + ': ' + JSON.stringify(result.error));
    assert('result' in result, name + ' missing result');
    checks++;
    return result.result;
  }
  async function bad(name, data, token, status) {
    const result = await callable(name, data, token);
    assert.equal(
      result.error?.status,
      status,
      name + ': ' + JSON.stringify(result),
    );
    checks++;
    return result.error;
  }
  const encode = (object) =>
    Buffer.from(JSON.stringify(object)).toString('base64url');
  async function signIn(label) {
    const email = marker + '-' + label + '@wads.dev';
    const idToken =
      encode({ alg: 'none', typ: 'JWT' }) +
      '.' +
      encode({
        sub: marker + '-' + label,
        email,
        email_verified: true,
        name: marker + '-' + label,
        aud: project,
        iss: 'https://accounts.google.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }) +
      '.';
    const response = await http(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=local-demo-only',
      {
        requestUri: 'http://localhost',
        postBody:
          'providerId=google.com&id_token=' + encodeURIComponent(idToken),
        returnSecureToken: true,
        returnIdpCredential: true,
      },
    );
    assert(
      response.body.localId && response.body.idToken,
      'Auth emulator failed: ' + JSON.stringify(response.body),
    );
    users.add(response.body.localId);
    const claims = await auth.verifyIdToken(response.body.idToken);
    assert.equal(claims.email, email);
    assert.equal(claims.email_verified, true);
    assert.equal(claims.firebase.sign_in_provider, 'google.com');
    return { uid: response.body.localId, token: response.body.idToken };
  }
  async function reserve(path) {
    assert(!owned.has(path));
    assert.equal(
      (await db.doc(path).get()).exists,
      false,
      'Refused existing document: ' + path,
    );
    owned.add(path);
  }
  function adapter(uid) {
    const tools = new Map();
    registerWorkTools(
      {
        registerTool: (name, config, callback) =>
          tools.set(name, { config, callback }),
      },
      repo,
      uid,
      new FirestoreRecordEditingRepository(db),
      new FirestoreProjectManagementRepository(db),
      new FirestoreTopicManagementRepository(db),
    );
    return async (name, input, expectedError) => {
      const tool = tools.get(name);
      assert(tool, 'Unknown adapter tool');
      const parsed = tool.config.inputSchema.parse(input);
      const result = await tool.callback(parsed);
      const data = JSON.parse(result.content[0].text);
      if (expectedError) {
        assert.equal(result.isError, true);
        assert.equal(data.error, expectedError);
      } else {
        assert(!result.isError, name + ': ' + JSON.stringify(data));
      }
      checks++;
      return data;
    };
  }
  const reason = marker + ' synthetic reason';
  const reportInput = {
    from: '2026-10-01T00:00:00Z',
    to: '2026-10-02T00:00:00Z',
    timeZone: 'UTC',
    includeArchived: true,
  };
  const stable = (value) =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([key]) => !['asOf', 'generatedAt'].includes(key))
              .map(([key, val]) => [key, stable(val)]),
          )
        : value;
  try {
    const a = await signIn('alice'),
      b = await signIn('bob');
    const normalizedTitle = title.replace(/[^a-z0-9]+/g, ' ').trim();
    const ids = {
      a: sha('personal:' + a.uid + ':' + normalizedTitle),
      b: sha('personal:' + b.uid + ':' + normalizedTitle),
      work: sha(normalizedTitle),
    };
    for (const id of Object.values(ids)) {
      await reserve('projects/' + id);
      await reserve('projects/' + id + '/audit/created');
    }
    await bad(
      'createProject',
      { title, description: reason },
      a.token,
      'INVALID_ARGUMENT',
    );
    const create = (type, token) =>
      good(
        'createProject',
        { title, description: reason, type, createdBy: 'untrusted-client' },
        token,
      );
    const pa = await create('personal', a.token),
      pb = await create('personal', b.token),
      work = await create('work', a.token);
    assert.equal(pa.id, ids.a);
    assert.equal(pb.id, ids.b);
    assert.equal(work.id, ids.work);
    assert.equal(pa.createdBy, a.uid);
    assert.equal(pb.createdBy, b.uid);
    assert.equal((await create('personal', a.token)).id, pa.id);
    assert.equal((await create('work', b.token)).id, work.id);
    const toolsA = adapter(a.uid),
      toolsB = adapter(b.uid);
    async function catalog(person, own, hidden) {
      let cursor,
        collected = [],
        pages = 0;
      do {
        const page = await good(
          'listProjects',
          { limit: 100, includeArchived: true, ...(cursor ? { cursor } : {}) },
          person.token,
        );
        collected.push(...page.projects);
        cursor = page.nextCursor;
        assert(++pages <= 20, 'Unexpected catalog pagination');
      } while (cursor);
      assert(collected.some((p) => p.id === own));
      assert(collected.some((p) => p.id === work.id));
      assert(!collected.some((p) => p.id === hidden));
    }
    await catalog(a, pa.id, pb.id);
    await catalog(b, pb.id, pa.id);
    const search = await toolsB('search_projects', {
      query: marker,
      limit: 100,
      includeArchived: true,
    });
    assert(!JSON.stringify(search).includes(pa.id));
    assert(JSON.stringify(search).includes(pb.id));
    await bad('listProjects', { cursor: pa.id }, b.token, 'INVALID_ARGUMENT');
    const hidden = await bad(
      'getProjectReport',
      { projectId: pa.id },
      b.token,
      'NOT_FOUND',
    );
    const missing = await bad(
      'getProjectReport',
      { projectId: marker + '-missing' },
      b.token,
      'NOT_FOUND',
    );
    assert.equal(hidden.message, missing.message);
    await good('getProjectReport', { projectId: pa.id }, a.token);
    const denied = 'Projeto não encontrado.';
    await toolsB(
      'create_topic',
      { projectId: pa.id, title: 'Synthetic topic', description: reason },
      denied,
    );
    await toolsB(
      'register',
      {
        projectId: pa.id,
        startedAt: reportInput.from,
        timeZone: 'UTC',
        originalText: reason,
        interpretation: reason,
        requestId: marker + '-denied',
      },
      denied,
    );
    for (const [name, input] of [
      [
        'updateProject',
        {
          projectId: pa.id,
          title: 'Changed',
          reason,
          requestId: marker + '-update',
        },
      ],
      [
        'archiveProject',
        {
          projectId: pa.id,
          archived: true,
          reason,
          requestId: marker + '-archive',
        },
      ],
      [
        'mergeTopics',
        { projectId: pa.id, sourceTopicIds: ['old'], targetTopicId: 'general' },
      ],
      ['listTopicMerges', { projectId: pa.id }],
      ['mergeProjects', { sourceProjectId: pa.id, targetProjectId: work.id }],
    ])
      await bad(name, input, b.token, 'NOT_FOUND');
    await bad(
      'updateProject',
      { projectId: pa.id, type: 'work', reason, requestId: marker + '-flip' },
      a.token,
      'FAILED_PRECONDITION',
    );
    await bad(
      'mergeProjects',
      { sourceProjectId: pa.id, targetProjectId: work.id },
      a.token,
      'FAILED_PRECONDITION',
    );
    // Cached audit contents are deliberately tempting: ACL must win before retry handling.
    for (const [suffix, name, input] of [
      ['cached-update', 'updateProject', { title: 'Changed' }],
      ['archive_cached-archive', 'archiveProject', { archived: true }],
    ]) {
      const path = 'projects/' + pa.id + '/audit/' + suffix;
      await reserve(path);
      await db.doc(path).create({
        authorUid: b.uid,
        result: { projectId: pa.id, secret: marker },
        marker,
      });
      await bad(
        name,
        {
          projectId: pa.id,
          ...input,
          reason,
          requestId: suffix === 'cached-update' ? suffix : 'cached-archive',
        },
        b.token,
        'NOT_FOUND',
      );
    }
    const workRequest = marker + '-work-record';
    await reserve('users/' + b.uid + '/records/' + sha(workRequest));
    await toolsB('register', {
      projectId: work.id,
      requestId: workRequest,
      startedAt: reportInput.from,
      endedAt: '2026-10-01T02:00:00Z',
      timeZone: 'UTC',
      originalText: reason,
      interpretation: reason,
    });
    const globalInput = { ...reportInput, projectId: work.id };
    const globalBefore = stable(
      await good('getCompanyReport', globalInput, b.token),
    );
    // Private-only closed and open facts must not alter company facts/counts/estimates/warnings.
    for (const [person, projectId, tool, endedAt] of [
      [a, pa.id, toolsA, '2026-10-01T01:00:00Z'],
      [b, pb.id, toolsB, undefined],
    ]) {
      const requestId = marker + '-record-' + person.uid;
      const path = 'users/' + person.uid + '/records/' + sha(requestId);
      await reserve(path);
      await tool('register', {
        projectId,
        startedAt: reportInput.from,
        ...(endedAt ? { endedAt } : {}),
        timeZone: 'UTC',
        originalText: marker + '-PRIVATE-TEXT',
        interpretation: reason,
        requestId,
      });
    }
    // Malformed private fact intentionally proves exclusion before parse/context errors.
    const malformedPath =
      'users/' + a.uid + '/records/' + marker + '-malformed';
    await reserve(malformedPath);
    await db.doc(malformedPath).create({
      projectId: pa.id,
      uid: a.uid,
      startedAt: reportInput.from,
      endedAt: 'not-a-date',
      marker,
    });
    const globalAfter = stable(
      await good('getCompanyReport', globalInput, b.token),
    );
    assert.deepEqual(
      globalAfter,
      globalBefore,
      'Company totals/counts/context changed after personal facts',
    );
    const personalB = await good('getPersonalReport', reportInput, b.token);
    assert(!JSON.stringify(personalB).includes(pa.id));
    assert(!JSON.stringify(personalB).includes(a.uid));
    assert(!JSON.stringify(globalAfter).includes(pa.id));
    assert(!JSON.stringify(globalAfter).includes(pb.id));
    const broadCompany = await good('getCompanyReport', reportInput, b.token);
    assert(!JSON.stringify(broadCompany).includes(pa.id));
    assert(!JSON.stringify(broadCompany).includes(pb.id));
    assert.equal(owned.size, 12, 'Unexpected document ledger');
    console.log(
      JSON.stringify({
        status: 'PASS',
        marker,
        checks,
        documentsOwned: owned.size,
        limitations: [
          'MCP adapter tested with trusted UID, not OAuth HTTP token transport',
          'Emulator Google claims are synthetic, not production Google signature proof',
          'No browser/production/deployment evidence',
          'No same-owner project merge execution or record-edit retry coverage',
        ],
      }),
    );
  } finally {
    const failures = [];
    for (const path of [...owned].reverse()) {
      try {
        await db.doc(path).delete();
      } catch (error) {
        failures.push({ path, message: error.message });
      }
    }
    for (const uid of users) {
      try {
        await auth.deleteUser(uid);
      } catch (error) {
        failures.push({ uid, message: error.message });
      }
    }
    await deleteApp(app);
    assert.equal(
      failures.length,
      0,
      'Cleanup failed; explicit ledger: ' + JSON.stringify(failures),
    );
  }
}
