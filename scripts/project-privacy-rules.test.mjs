/**
 * Real Firestore emulator security evaluation; no SDK or new dependencies.
 * Starts its own Java process on an ephemeral loopback port, never an external
 * emulator. Use a demo-* project and synthetic UIDs only. See security doc.
 * Unsigned emulator JWTs model Auth claims, not production signature checking.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url));
const jarPath = process.env.PROJECT_PRIVACY_EMULATOR_JAR;
const project = 'demo-project-privacy-rules';
const alice = 'privacy-alice';
const bob = 'privacy-bob';
let emulator;
let emulatorClosed;
let emulatorLogs = '';
let root;
let documentRoot;

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  return port;
}

function jwt(uid, changes = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'https://securetoken.google.com/' + project,
    aud: project,
    sub: uid,
    user_id: uid,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    email: uid + '@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    ...changes,
  };
  // A null value deletes a claim, allowing missing-claim negative tests.
  for (const [key, value] of Object.entries(payload))
    if (value === null) delete payload[key];
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({ alg: 'none', typ: 'JWT' }) + '.' + encode(payload) + '.';
}
const aliceToken = jwt(alice);
const bobToken = jwt(bob);

function value(field) {
  if (field === null) return { nullValue: null };
  if (typeof field === 'string') return { stringValue: field };
  if (typeof field === 'boolean') return { booleanValue: field };
  if (typeof field === 'number') return { integerValue: String(field) };
  if (Array.isArray(field)) return { arrayValue: { values: field.map(value) } };
  return { mapValue: { fields: fields(field) } };
}
function fields(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, field]) => [key, value(field)]),
  );
}
function documentUrl(path) {
  return documentRoot + '/' + path.split('/').map(encodeURIComponent).join('/');
}
async function request(url, token, method = 'GET', body) {
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = 'Bearer ' + token;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}
function get(path, token) {
  return request(documentUrl(path), token);
}
function list(path, token) {
  return request(documentUrl(path) + '?pageSize=100', token);
}
function write(path, data, token) {
  return request(documentUrl(path), token, 'PATCH', { fields: fields(data) });
}
function query(parent, collectionId, token, options = {}) {
  const { allDescendants = false, where, orderBy, limit = 100 } = options;
  const url = parent
    ? documentUrl(parent) + ':runQuery'
    : documentRoot + ':runQuery';
  return request(url, token, 'POST', {
    structuredQuery: {
      from: [{ collectionId, allDescendants }],
      limit,
      ...(where ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
    },
  });
}
function equal(fieldPath, field) {
  return {
    fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: value(field) },
  };
}
async function allowed(result) {
  const actual = await result;
  assert.equal(actual.status, 200, JSON.stringify(actual));
  return actual.data;
}
async function denied(result) {
  const actual = await result;
  assert.equal(actual.status, 403, JSON.stringify(actual));
  assert.equal(
    actual.data.error?.status,
    'PERMISSION_DENIED',
    JSON.stringify(actual),
  );
}

before(async () => {
  assert.ok(
    jarPath,
    'Set PROJECT_PRIVACY_EMULATOR_JAR to an existing cached emulator JAR; never install dependencies.',
  );
  // Never honor FIRESTORE_EMULATOR_HOST: this harness starts and owns its runtime.
  await Promise.all([access(jarPath), access(rulesPath)]);
  assert.match(await readFile(rulesPath, 'utf8'), /rules_version/);
  const port = await unusedPort();
  root = 'http://127.0.0.1:' + port;
  documentRoot =
    root + '/v1/projects/' + project + '/databases/(default)/documents';
  emulator = spawn(
    process.env.PROJECT_PRIVACY_JAVA || 'java',
    [
      '-jar',
      jarPath,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--project_id',
      project,
      '--single_project_mode',
      '--single_project_mode_error',
      '--rules',
      rulesPath,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  emulatorClosed = once(emulator, 'close');
  emulatorClosed.catch(() => {});
  for (const stream of [emulator.stdout, emulator.stderr]) {
    stream.on('data', (chunk) => {
      emulatorLogs = (emulatorLogs + chunk).slice(-20000);
    });
  }
  let ready = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (emulator.exitCode !== null)
      throw new Error('Isolated emulator exited: ' + emulatorLogs);
    try {
      const response = await fetch(root, { signal: AbortSignal.timeout(500) });
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* Only poll this owned local child for readiness. */
    }
    await delay(100);
  }
  assert.ok(ready, 'Isolated emulator did not become ready: ' + emulatorLogs);
  console.log(
    'ISOLATED_RUNTIME project=' +
      project +
      ' host=' +
      root +
      ' javaPid=' +
      emulator.pid,
  );

  const projects = [
    ['work', { type: 'work', createdBy: alice }],
    ['work-bob', { type: 'work', createdBy: bob, confidential: true }],
    ['legacy', { createdBy: alice }],
    ['legacy-no-owner', {}],
    ['personal-alice', { type: 'personal', createdBy: alice }],
    ['personal-bob', { type: 'personal', createdBy: bob }],
    ['personal-no-owner', { type: 'personal' }],
    ['personal-null-owner', { type: 'personal', createdBy: null }],
    ['personal-number-owner', { type: 'personal', createdBy: 7 }],
    ['personal-list-owner', { type: 'personal', createdBy: [alice] }],
    ['personal-map-owner', { type: 'personal', createdBy: { uid: alice } }],
    ['personal-empty-owner', { type: 'personal', createdBy: '' }],
    ['personal-long-owner', { type: 'personal', createdBy: 'x'.repeat(129) }],
    ['bad-type', { type: 'company', createdBy: alice }],
    ['null-type', { type: null, createdBy: alice }],
    ['number-type', { type: 1, createdBy: alice }],
    ['list-type', { type: ['work'], createdBy: alice }],
    ['map-type', { type: { name: 'work' }, createdBy: alice }],
  ];
  for (const [id, data] of projects) {
    await allowed(
      write(
        'projects/' + id,
        {
          id,
          title: id,
          description: 'Synthetic security fixture',
          ...data,
          topics: [
            {
              id: 'general',
              title: 'Private embedded topic',
              description: 'Sentinel',
            },
          ],
        },
        'owner',
      ),
    );
  }
  const records = [
    ['work', { projectId: 'work' }],
    ['legacy', { projectId: 'legacy' }],
    ['legacy-no-owner', { projectId: 'legacy-no-owner' }],
    ['personal', { projectId: 'personal-alice', type: 'work', uid: alice }],
    ['personal-bob', { projectId: 'personal-bob' }],
    ['bad-type', { projectId: 'bad-type' }],
    ['bad-owner', { projectId: 'personal-no-owner' }],
    [
      'orphan',
      { projectId: 'missing-project', projectSnapshot: { type: 'work' } },
    ],
    ['no-project', {}],
    ['null-project', { projectId: null }],
    ['number-project', { projectId: 7 }],
    ['list-project', { projectId: ['work'] }],
    ['map-project', { projectId: { id: 'work' } }],
    ['empty-project', { projectId: '' }],
    ['path-project', { projectId: 'work/topics/general' }],
  ];
  for (const uid of [alice, bob]) {
    for (const [id, data] of records) {
      await allowed(
        write(
          'users/' + uid + '/records/' + id,
          {
            uid,
            originalText: 'Synthetic private transcript',
            ...data,
          },
          'owner',
        ),
      );
    }
    await allowed(
      write(
        'users/' + uid + '/records/work/audit/entry',
        { reason: 'Private audit', authorUid: uid },
        'owner',
      ),
    );
    await allowed(
      write(
        'users/' + uid + '/records/personal/audit/entry',
        { reason: 'Private audit', authorUid: uid },
        'owner',
      ),
    );
    await allowed(
      write(
        'users/' + uid + '/records/orphan/audit/entry',
        { reason: 'Owner orphan history' },
        'owner',
      ),
    );
    await allowed(write('users/' + uid, { email: uid + '@wads.dev' }, 'owner'));
  }
  for (const path of [
    'projects/work/topics/nested',
    'projects/personal-alice/topics/nested',
    'projects/work/audit/entry',
    'projects/work/merges/entry',
    'projects/work/records/nested',
    'users/' + alice + '/topics/nested',
    'oauth_states/secret',
    'oauth_tokens/secret',
    'internal_jobs/secret',
  ])
    await allowed(write(path, { secret: 'Synthetic sentinel' }, 'owner'));
});

after(async () => {
  if (!emulator) return;
  if (emulator.exitCode !== null) {
    if (emulator.exitCode !== 0) console.error(emulatorLogs);
    return;
  }
  emulator.kill('SIGTERM');
  const force = setTimeout(() => emulator.kill('SIGKILL'), 5000);
  try {
    await emulatorClosed;
  } finally {
    clearTimeout(force);
  }
});

test('project privacy: real Firestore rules with Alice and Bob', async (t) => {
  const check = (name, run) => t.test(name, run);
  for (const [uid, token, other, otherToken] of [
    [alice, aliceToken, bob, bobToken],
    [bob, bobToken, alice, aliceToken],
  ]) {
    const ownProject = uid === alice ? 'personal-alice' : 'personal-bob';
    const otherProject = uid === alice ? 'personal-bob' : 'personal-alice';
    await check(
      uid + ': own personal get includes embedded topics',
      async () => {
        const data = await allowed(get('projects/' + ownProject, token));
        assert.equal(data.fields.topics.arrayValue.values.length, 1);
      },
    );
    await check(uid + ': other personal get denied', () =>
      denied(get('projects/' + otherProject, token)),
    );
    for (const id of ['work', 'work-bob', 'legacy', 'legacy-no-owner']) {
      await check(uid + ': shared work/legacy get ' + id, () =>
        allowed(get('projects/' + id, token)),
      );
    }
    await check(uid + ': all project list denied', () =>
      denied(list('projects', token)),
    );
    await check(uid + ': old project query denied', () =>
      denied(query('', 'projects', token)),
    );
    await check(uid + ': even work-only project query denied', () =>
      denied(query('', 'projects', token, { where: equal('type', 'work') })),
    );
    await check(uid + ': even owner-filtered project query denied', () =>
      denied(query('', 'projects', token, { where: equal('createdBy', uid) })),
    );
    await check(uid + ': own entire canonical history allowed', async () => {
      const result = await allowed(list('users/' + uid + '/records', token));
      assert.equal(result.documents.length, 15);
    });
    await check(uid + ': own paginated history query allowed', async () => {
      const result = await allowed(
        query('users/' + uid, 'records', token, {
          orderBy: [
            { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
          ],
          limit: 100,
        }),
      );
      assert.equal(result.filter((row) => row.document).length, 15);
    });
    for (const id of [
      'personal',
      'bad-type',
      'bad-owner',
      'orphan',
      'no-project',
      'path-project',
    ]) {
      await check(uid + ': own history get ' + id + ' allowed', () =>
        allowed(get('users/' + uid + '/records/' + id, token)),
      );
    }
    for (const id of ['work', 'legacy', 'legacy-no-owner']) {
      await check(uid + ': other canonical work get ' + id + ' allowed', () =>
        allowed(get('users/' + other + '/records/' + id, token)),
      );
    }
    for (const id of [
      'personal',
      'personal-bob',
      'bad-type',
      'bad-owner',
      'orphan',
      'no-project',
      'null-project',
      'number-project',
      'list-project',
      'map-project',
      'empty-project',
      'path-project',
    ]) {
      await check(uid + ': other canonical record ' + id + ' denied', () =>
        denied(get('users/' + other + '/records/' + id, token)),
      );
    }
    await check(uid + ': other canonical list denied', () =>
      denied(list('users/' + other + '/records', token)),
    );
    await check(uid + ': other work-filtered canonical query denied', () =>
      denied(
        query('users/' + other, 'records', token, {
          where: equal('projectId', 'work'),
        }),
      ),
    );
    await check(uid + ': collectionGroup records denied', () =>
      denied(query('', 'records', token, { allDescendants: true })),
    );
    await check(uid + ': own uid collectionGroup records denied', () =>
      denied(
        query('', 'records', token, {
          allDescendants: true,
          where: equal('uid', uid),
        }),
      ),
    );
    for (const id of ['work', 'personal', 'orphan']) {
      await check(uid + ': own audit get ' + id + ' allowed', () =>
        allowed(get('users/' + uid + '/records/' + id + '/audit/entry', token)),
      );
      await check(uid + ': other audit get ' + id + ' denied', () =>
        denied(
          get('users/' + other + '/records/' + id + '/audit/entry', token),
        ),
      );
    }
    await check(uid + ': own audit list allowed', () =>
      allowed(list('users/' + uid + '/records/work/audit', token)),
    );
    await check(uid + ': other audit list denied', () =>
      denied(list('users/' + other + '/records/work/audit', token)),
    );
    await check(uid + ': owner personal type flip denied', () =>
      denied(write('projects/' + ownProject, { type: 'work' }, token)),
    );
    await check(uid + ': other personal ownership hijack denied', () =>
      denied(write('projects/' + otherProject, { createdBy: uid }, token)),
    );
    await check(uid + ': work privatization denied', () =>
      denied(
        write('projects/work', { type: 'personal', createdBy: uid }, token),
      ),
    );
    await check(uid + ': own record project flip denied', () =>
      denied(
        write(
          'users/' + uid + '/records/personal',
          { projectId: 'work' },
          token,
        ),
      ),
    );
    await check(uid + ': own audit update denied', () =>
      denied(
        write(
          'users/' + uid + '/records/work/audit/entry',
          { reason: 'Tampered' },
          token,
        ),
      ),
    );
    await check(uid + ': own project delete denied', () =>
      denied(request(documentUrl('projects/' + ownProject), token, 'DELETE')),
    );
    await check(uid + ': own record delete denied', () =>
      denied(
        request(documentUrl('users/' + uid + '/records/work'), token, 'DELETE'),
      ),
    );
    await check(uid + ': personal remains private after denied flips', () =>
      denied(get('projects/' + ownProject, otherToken)),
    );
  }

  for (const id of [
    'personal-no-owner',
    'personal-null-owner',
    'personal-number-owner',
    'personal-list-owner',
    'personal-map-owner',
    'personal-empty-owner',
    'personal-long-owner',
    'bad-type',
    'null-type',
    'number-type',
    'list-type',
    'map-type',
  ]) {
    for (const [uid, token] of [
      [alice, aliceToken],
      [bob, bobToken],
    ]) {
      await check(uid + ': malformed personal/enum ' + id + ' denied', () =>
        denied(get('projects/' + id, token)),
      );
    }
  }
  const invalidAuth = [
    ['unauthenticated', null],
    ['anonymous', jwt(alice, { firebase: { sign_in_provider: 'anonymous' } })],
    ['unverified', jwt(alice, { email_verified: false })],
    ['verification string', jwt(alice, { email_verified: 'true' })],
    [
      'wrong provider',
      jwt(alice, { firebase: { sign_in_provider: 'password' } }),
    ],
    ['wrong domain', jwt(alice, { email: 'alice@example.com' })],
    ['domain suffix attack', jwt(alice, { email: 'alice@wads.dev.evil' })],
    ['missing email', jwt(alice, { email: null })],
    ['missing verified', jwt(alice, { email_verified: null })],
    ['missing firebase', jwt(alice, { firebase: null })],
    ['missing provider', jwt(alice, { firebase: {} })],
  ];
  for (const [name, token] of invalidAuth) {
    for (const path of [
      'projects/work',
      'projects/personal-alice',
      'users/' + alice + '/records/work',
      'users/' + alice + '/records/work/audit/entry',
    ]) {
      await check(name + ': get denied ' + path, () =>
        denied(get(path, token)),
      );
    }
    await check(name + ': own history list denied', () =>
      denied(list('users/' + alice + '/records', token)),
    );
    await check(name + ': own audit list denied', () =>
      denied(list('users/' + alice + '/records/work/audit', token)),
    );
  }
  await check('case-insensitive exact company domain accepted', () =>
    allowed(get('projects/work', jwt(alice, { email: 'ALICE@WADS.DEV' }))),
  );
  for (const path of [
    'projects/work/topics/nested',
    'projects/personal-alice/topics/nested',
    'projects/work/audit/entry',
    'projects/work/merges/entry',
    'projects/work/records/nested',
    'users/' + alice + '/topics/nested',
    'users/' + alice,
    'oauth_states/secret',
    'oauth_tokens/secret',
    'internal_jobs/secret',
  ]) {
    for (const [uid, token] of [
      [alice, aliceToken],
      [bob, bobToken],
    ]) {
      await check(uid + ': default deny get ' + path, () =>
        denied(get(path, token)),
      );
      await check(uid + ': default deny write ' + path, () =>
        denied(write(path, { secret: 'Overwrite' }, token)),
      );
    }
  }
  for (const path of [
    'projects/work/topics',
    'projects/personal-alice/topics',
    'users',
    'oauth_states',
    'oauth_tokens',
    'internal_jobs',
  ]) {
    await check('default deny list ' + path, () =>
      denied(list(path, aliceToken)),
    );
  }
  for (const path of [
    'projects/new-project',
    'users/' + alice + '/records/new-record',
    'users/' + alice + '/records/work/audit/new-audit',
  ]) {
    await check('client create denied ' + path, () =>
      denied(
        write(
          path,
          { type: 'personal', createdBy: alice, projectId: 'work' },
          aliceToken,
        ),
      ),
    );
  }
  await check('owner audit deletion denied', () =>
    denied(
      request(
        documentUrl('users/' + alice + '/records/work/audit/entry'),
        aliceToken,
        'DELETE',
      ),
    ),
  );
  await check('forged record owner field cannot reveal personal', () =>
    denied(get('users/' + bob + '/records/personal', aliceToken)),
  );
  await check(
    'trusted type changes immediately affect other-user record authorization',
    async () => {
      const projectPath = 'projects/admin-flip';
      const recordPath = 'users/' + alice + '/records/admin-flip';
      await allowed(
        write(projectPath, { type: 'work', createdBy: alice }, 'owner'),
      );
      await allowed(
        write(
          recordPath,
          {
            uid: alice,
            projectId: 'admin-flip',
            type: 'work',
            projectSnapshot: { type: 'work' },
          },
          'owner',
        ),
      );
      await allowed(get(recordPath, bobToken));
      await allowed(
        write(projectPath, { type: 'personal', createdBy: alice }, 'owner'),
      );
      await denied(get(projectPath, bobToken));
      await denied(get(recordPath, bobToken));
      await allowed(get(recordPath, aliceToken));
      await allowed(
        write(projectPath, { type: 'invalid', createdBy: alice }, 'owner'),
      );
      await denied(get(recordPath, bobToken));
      await allowed(request(documentUrl(projectPath), 'owner', 'DELETE'));
      await denied(get(recordPath, bobToken));
      await allowed(get(recordPath, aliceToken));
    },
  );
});
