// Run only inside a private Docker network namespace; never on the live host.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
assert.equal(process.env.DESIGN_FIXTURE_PRIVATE, '1');
const { projectId, docs } = JSON.parse(
  await readFile('/workspace/demo-seed.json', 'utf8'),
);
assert.equal(projectId, 'demo-work-track');
assert.equal(docs.length, 56);
const base =
  'http://127.0.0.1:8081/v1/projects/demo-work-track/databases/(default)/documents/';
async function call(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: {
      Authorization: 'Bearer owner',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error(r.status + ' ' + (await r.text()));
  return r.json();
}
function value(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, value(x)]),
      ),
    },
  };
}
if (process.argv.includes('--seed')) {
  for (const [path, data] of docs) {
    assert(
      new RegExp(
        '^(projects/design-demo-[a-z-]+|users/(35DvlWmc9p9KBKl6KD6i41aVGHPT|design-demo-colleague)/records/design-demo-record-[0-9]{3}(/audit/design-demo-example)?)$',
      ).test(path),
    );
    const split = path.lastIndexOf('/');
    await call(
      base + path.slice(0, split) + '?documentId=' + path.slice(split + 1),
      {
        method: 'POST',
        body: JSON.stringify({
          fields: Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, value(v)]),
          ),
        }),
      },
    );
  }
  const users = [
    [
      '35DvlWmc9p9KBKl6KD6i41aVGHPT',
      'frontend.review@wads.dev',
      'Revisão visual (DEMO)',
    ],
    [
      'design-demo-colleague',
      'demo.colleague@wads.dev',
      'Colega sintético (DEMO)',
    ],
  ].map(([localId, email, displayName]) => ({
    localId,
    email,
    displayName,
    emailVerified: true,
    createdAt: '1790852400000',
    providerUserInfo: [
      {
        providerId: 'google.com',
        rawId: 'design-demo-' + localId,
        email,
        displayName,
      },
    ],
  }));
  await call(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-work-track/accounts:batchCreate',
    { method: 'POST', body: JSON.stringify({ users }) },
  );
}
const projects = await call(base + 'projects');
assert.equal(projects.documents.length, 7);
const roots = await call(base.slice(0, -1) + ':listCollectionIds', {
  method: 'POST',
  body: JSON.stringify({ pageSize: 100 }),
});
assert.deepEqual(roots.collectionIds.sort(), ['projects', 'users']);
const expected = new Map(docs);
function decode(v) {
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  return Object.fromEntries(
    Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]),
  );
}
const seen = new Set();
async function walk(parent = '') {
  const collections = await call(
    base.slice(0, -1) + (parent ? '/' + parent : '') + ':listCollectionIds',
    { method: 'POST', body: JSON.stringify({ pageSize: 100 }) },
  );
  assert(!collections.nextPageToken);
  for (const name of collections.collectionIds ?? []) {
    const collection = parent ? parent + '/' + name : name;
    const page = await call(
      base + collection + '?pageSize=100&showMissing=true',
    );
    assert(!page.nextPageToken);
    for (const d of page.documents ?? []) {
      const path = d.name.split('/documents/')[1];
      if (d.fields) {
        assert(expected.has(path), 'Unexpected document ' + path);
        assert.deepEqual(
          Object.fromEntries(
            Object.entries(d.fields).map(([k, v]) => [k, decode(v)]),
          ),
          expected.get(path),
        );
        seen.add(path);
      }
      await walk(path);
    }
  }
}
await walk();
assert.deepEqual([...seen].sort(), docs.map(([p]) => p).sort());
for (const [path, data] of docs) {
  const r = await call(base + path);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(r.fields).map(([k, v]) => [k, decode(v)]),
    ),
    data,
  );
}
const auth = await call(
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-work-track/accounts:batchGet',
);
assert.equal(auth.users.length, 2);
for (const u of auth.users) {
  assert(u.emailVerified);
  assert.equal(u.providerUserInfo[0].providerId, 'google.com');
  for (const key of Object.keys(u))
    assert(
      !/password|salt|token|secret/i.test(key),
      'Forbidden Auth field ' + key,
    );
}
console.log(
  'VERIFIED 7 projects / 44 records / 5 audits / 2 synthetic Google users; only projects/users roots',
);
