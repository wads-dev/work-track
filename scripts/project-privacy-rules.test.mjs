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
const externalAliceToken = jwt(alice, {
  email: 'alice@example.net',
  firebase: { sign_in_provider: 'password' },
});

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
  if (token !== null && token !== undefined)
    headers.authorization = 'Bearer ' + token;
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
  // A Web SDK collection read is an unfiltered structured query. Keep the same
  // authenticated token and negative permission expectation as filtered queries.
  const segments = path.split('/');
  const collectionId = segments.pop();
  return query(segments.join('/'), collectionId, token);
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

function and(...filters) {
  return { compositeFilter: { op: 'AND', filters } };
}
function compare(fieldPath, op, field) {
  return { fieldFilter: { field: { fieldPath }, op, value: value(field) } };
}
function validProject(id, owner, type = 'work') {
  return {
    id,
    type,
    createdBy: owner,
    createdAt: '2026-10-09T12:00:00Z',
    title: 'Synthetic project',
    description: 'Synthetic project description for rules',
    topics: [],
  };
}
function validRecord(projectId, uid = alice) {
  return {
    uid,
    projectId,
    startedAt: '2026-10-09T12:00:00Z',
    timeZone: 'UTC',
    originalText: 'Synthetic transcript',
    interpretation: 'Synthetic context',
    requestId: 'synthetic-request',
    fingerprint: 'synthetic-fingerprint',
    topics: [],
  };
}
test('project authorization: public authenticated and own personal', async (t) => {
  const external = jwt('external', {
    email: 'external@example.com',
    email_verified: false,
    firebase: { sign_in_provider: 'password' },
  });
  await t.test(
    'public means any authenticated provider; private uses parent owner only',
    async () => {
      for (const token of [aliceToken, bobToken, external]) {
        for (const p of ['work', 'legacy', 'legacy-no-owner'])
          await allowed(get('projects/' + p, token));
        await allowed(get('users/' + alice + '/records/work', token));
        await denied(
          get(
            'projects/personal-alice',
            token === aliceToken ? bobToken : token,
          ),
        );
      }
      await allowed(get('projects/personal-alice', aliceToken));
      await allowed(get('users/' + bob + '/records/personal', aliceToken));
      await denied(get('users/' + alice + '/records/personal', bobToken));
      for (const path of ['projects/work', 'users/' + alice + '/records/work'])
        await denied(get(path));
    },
  );
  await t.test(
    'invalid parents, forged snapshots and own orphan history fail closed',
    async () => {
      for (const id of [
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
        for (const token of [aliceToken, externalAliceToken, bobToken])
          await denied(get('users/' + alice + '/records/' + id, token));
      }
      await denied(get('projects/bad-type', aliceToken));
    },
  );
  await t.test(
    'project discovery is query-compatible, not an unfiltered list',
    async () => {
      await allowed(
        query('', 'projects', bobToken, { where: equal('type', 'work') }),
      );
      await allowed(
        query('', 'projects', aliceToken, {
          where: and(equal('type', 'personal'), equal('createdBy', alice)),
        }),
      );
      await denied(
        query('', 'projects', bobToken, {
          where: and(equal('type', 'personal'), equal('createdBy', alice)),
        }),
      );
      await denied(list('projects', aliceToken));
      await denied(
        query('', 'projects', undefined, { where: equal('type', 'work') }),
      );
    },
  );
  await t.test(
    'collectionGroup records: project constraint plus temporal and UID filters',
    async () => {
      const options = {
        allDescendants: true,
        where: equal('projectId', 'work'),
      };
      await allowed(query('', 'records', bobToken, options));
      await allowed(
        query('', 'records', aliceToken, {
          allDescendants: true,
          where: equal('projectId', 'personal-alice'),
        }),
      );
      await denied(
        query('', 'records', bobToken, {
          allDescendants: true,
          where: equal('projectId', 'personal-alice'),
        }),
      );
      for (const token of [aliceToken, externalAliceToken, bobToken]) {
        await denied(
          query('', 'records', token, {
            allDescendants: true,
            where: equal('uid', alice),
          }),
        );
        await denied(list('users/' + alice + '/records', token));
        await denied(
          query('users/' + alice, 'records', token, {
            where: equal('uid', alice),
          }),
        );
        await allowed(
          query('users/' + alice, 'records', token, {
            where: equal('projectId', 'work'),
          }),
        );
      }
      await denied(query('', 'records', undefined, options));
      await allowed(
        write(
          'users/' + alice + '/records/timed',
          validRecord('work'),
          'owner',
        ),
      );
      await allowed(
        query('', 'records', bobToken, {
          allDescendants: true,
          where: and(
            equal('projectId', 'work'),
            equal('uid', alice),
            compare(
              'startedAt',
              'GREATER_THAN_OR_EQUAL',
              '2026-10-09T00:00:00Z',
            ),
            compare('startedAt', 'LESS_THAN', '2026-10-10T00:00:00Z'),
          ),
          orderBy: [
            { field: { fieldPath: 'startedAt' }, direction: 'ASCENDING' },
          ],
        }),
      );
    },
  );
  await t.test(
    'project writes protect ownership/type and validate schema',
    async () => {
      const p = validProject('client-project', alice);
      await allowed(write('projects/client-project', p, aliceToken));
      await allowed(
        write(
          'projects/client-project',
          { ...p, title: 'Edited by public user' },
          bobToken,
        ),
      );
      await denied(
        write('projects/client-project', { ...p, createdBy: bob }, bobToken),
      );
      await denied(
        write(
          'projects/client-project',
          { ...p, type: 'personal' },
          aliceToken,
        ),
      );
      await denied(
        write('projects/client-project', { ...p, type: 'invalid' }, aliceToken),
      );
      await denied(
        write(
          'projects/forged-owner',
          validProject('forged-owner', alice),
          bobToken,
        ),
      );
      await denied(
        write('projects/malformed', { type: 'work', createdBy: bob }, bobToken),
      );
      await denied(
        write(
          'projects/personal-alice',
          validProject('personal-alice', alice, 'personal'),
          bobToken,
        ),
      );
      await denied(
        request(documentUrl('projects/personal-alice'), bobToken, 'DELETE'),
      );
      await allowed(
        request(documentUrl('projects/client-project'), bobToken, 'DELETE'),
      );
    },
  );
  await t.test(
    'record create/update/delete use parent, preserve identity and both move endpoints',
    async () => {
      const path = 'users/' + alice + '/records/client-record';
      const record = validRecord('work');
      await allowed(write(path, record, bobToken));
      await allowed(
        write(path, { ...record, interpretation: 'Public edit' }, bobToken),
      );
      await denied(write(path, { ...record, uid: bob }, bobToken));
      await denied(
        write(path, { ...record, fingerprint: 'changed' }, bobToken),
      );
      await denied(
        write(path, { ...record, projectId: 'personal-alice' }, bobToken),
      );
      await denied(
        write(path, { ...record, projectId: 'missing-project' }, aliceToken),
      );
      await denied(write(path, { ...record, topics: 'bad' }, bobToken));
      await denied(
        write(
          'users/' + alice + '/records/forged',
          { ...record, uid: bob },
          bobToken,
        ),
      );
      await denied(
        write(
          'users/' + alice + '/records/private-forged',
          validRecord('personal-alice'),
          bobToken,
        ),
      );
      await denied(write('users/' + alice + '/records/anonymous', record));
      await allowed(
        write(path, { ...record, projectId: 'personal-alice' }, aliceToken),
      );
      await denied(write(path, record, bobToken));
      await denied(request(documentUrl(path), bobToken, 'DELETE'));
      await allowed(write(path, record, aliceToken));
      await allowed(request(documentUrl(path), bobToken, 'DELETE'));
    },
  );
  await t.test(
    'current parent revocation and deletion affect records and queries',
    async () => {
      const p = 'projects/revoked';
      const path = 'users/' + alice + '/records/revoked';
      await allowed(write(p, validProject('revoked', alice), 'owner'));
      await allowed(write(path, validRecord('revoked'), 'owner'));
      await allowed(get(path, bobToken));
      await allowed(
        write(p, validProject('revoked', alice, 'personal'), 'owner'),
      );
      await denied(get(path, bobToken));
      await denied(
        query('', 'records', bobToken, {
          allDescendants: true,
          where: equal('projectId', 'revoked'),
        }),
      );
      await allowed(get(path, aliceToken));
      await allowed(request(documentUrl(p), 'owner', 'DELETE'));
      for (const token of [aliceToken, externalAliceToken, bobToken])
        await denied(get(path, token));
      await denied(write(path, validRecord('work'), aliceToken));
      await denied(request(documentUrl(path), aliceToken, 'DELETE'));
    },
  );
  await t.test(
    'no recursive audit, OAuth, profile or projection grants',
    async () => {
      for (const path of [
        'users/' + alice,
        'oauth_tokens/secret',
        'oauth_states/secret',
        'projects/work/topics/nested',
        'projects/work/audit/entry',
        'projects/work/merges/entry',
        'projects/work/reportRecords/hidden',
      ]) {
        await denied(get(path, aliceToken));
        await denied(write(path, { secret: 'forged' }, aliceToken));
      }
      await allowed(
        get('users/' + alice + '/records/work/audit/entry', aliceToken),
      );
      await denied(
        get('users/' + alice + '/records/work/audit/entry', bobToken),
      );
      await denied(
        write(
          'users/' + alice + '/records/work/audit/entry',
          { authorUid: alice },
          aliceToken,
        ),
      );
    },
  );
  await t.test(
    'anonymous provider and endedAt overlap constraints',
    async () => {
      const anonymous = jwt(alice, {
        firebase: { sign_in_provider: 'anonymous' },
      });
      await denied(get('projects/work', anonymous));
      await denied(get('users/' + alice + '/records/work', anonymous));
      await denied(
        query('', 'records', anonymous, {
          allDescendants: true,
          where: equal('projectId', 'work'),
        }),
      );
      await denied(
        write(
          'users/' + alice + '/records/anonymous-provider',
          validRecord('work'),
          anonymous,
        ),
      );
      await allowed(
        write(
          'users/' + alice + '/records/overlap',
          {
            ...validRecord('work'),
            startedAt: '2026-10-08T23:00:00Z',
            endedAt: '2026-10-09T02:00:00Z',
          },
          'owner',
        ),
      );
      await allowed(
        query('', 'records', bobToken, {
          allDescendants: true,
          where: and(
            equal('projectId', 'work'),
            equal('uid', alice),
            compare('endedAt', 'GREATER_THAN_OR_EQUAL', '2026-10-09T00:00:00Z'),
            compare('startedAt', 'LESS_THAN', '2026-10-10T00:00:00Z'),
          ),
        }),
      );
    },
  );
});
