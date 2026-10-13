import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
  patchFirestoreLocalIndex,
  patchFirestoreLocalIndexBundle,
} from './patch-firestore-local-index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'node_modules/@firebase/firestore/dist');
const filenames = [
  'common-CLMydGSF.esm.js',
  'common-CHRxpN5I.cjs.js',
  'common-B30b72EX.node.cjs.js',
  'common-CzMvp0wA.rn.js',
  'intermediate/common.js',
];
const newline = String.fromCharCode(10);
const originalMinified =
  'n.documentKey.path.isEmpty() ? "" : n.documentKey.path.lastSegment()';
const patchedMinified =
  'n.documentKey.path.isEmpty() || !n.documentKey.getCollectionPath().isEqual(s) ? "" : n.documentKey.path.lastSegment()';
const originalReadable = 'offset.documentKey.path.isEmpty()';
const patchedReadable =
  'offset.documentKey.path.isEmpty() || !offset.documentKey.getCollectionPath().isEqual(collection)';

async function sdkSnippet(filename) {
  // Use the pinned published method, not a second implementation of the fix.
  // A local prepare may already have patched it; normalize only our exact fix.
  const installed = await readFile(join(dist, filename), 'utf8');
  const source = installed
    .replace(patchedMinified, originalMinified)
    .replace(patchedReadable, originalReadable);
  const signature = filename.includes('.node.')
    ? '    getDocumentsMatchingQuery(transaction, query, offset, mutatedDocs, context) {'
    : '    getDocumentsMatchingQuery(e, t, n, r, i) {';
  const start = source.indexOf(signature);
  const end = source.indexOf('    getAllFromCollectionGroup(', start);
  assert(start >= 0 && end > start, 'Missing pinned SDK method: ' + filename);
  return source.slice(start, end);
}

async function installation(
  t,
  { firebase = '12.19.0', firestore = '4.17.2' } = {},
) {
  const prefix = join(tmpdir(), 'work-track-firestore-patch-');
  const directory = await mkdtemp(prefix);
  t.after(async () => {
    // The generated path must remain our dedicated fixture before deletion.
    assert(resolve(directory).startsWith(resolve(prefix)));
    await rm(directory, { recursive: true, force: true });
  });
  const put = async (filename, source) => {
    const path = join(directory, filename);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source);
  };
  await put(
    'node_modules/firebase/package.json',
    JSON.stringify({
      name: 'firebase',
      version: firebase,
      dependencies: { '@firebase/firestore': '4.17.2' },
    }),
  );
  await put(
    'node_modules/@firebase/firestore/package.json',
    JSON.stringify({
      name: '@firebase/firestore',
      version: firestore,
    }),
  );
  const originals = new Map();
  for (const filename of filenames) {
    const source =
      '// synthetic bundle wrapper' + newline + (await sdkSnippet(filename));
    originals.set(filename, source);
    await put('node_modules/@firebase/firestore/dist/' + filename, source);
  }
  const lite =
    '// Firestore Lite has no persistent local-cache query engine.' + newline;
  for (const filename of [
    'lite/common-synthetic.esm.js',
    'intermediate/lite/common.browser.js',
  ]) {
    originals.set(filename, lite);
    await put('node_modules/@firebase/firestore/dist/' + filename, lite);
  }
  const bundlePath = (filename) =>
    join(directory, 'node_modules/@firebase/firestore/dist', filename);
  const snapshot = async () =>
    new Map(
      await Promise.all(
        [...originals.keys()].map(async (filename) => [
          filename,
          await readFile(bundlePath(filename), 'utf8'),
        ]),
      ),
    );
  return { directory, originals, put, bundlePath, snapshot };
}

class ResourcePath {
  constructor(segments) {
    this.segments = segments;
  }
  static fromString(path) {
    return new ResourcePath(path ? path.split('/') : []);
  }
  popLast() {
    return new ResourcePath(this.segments.slice(0, -1));
  }
  lastSegment() {
    return this.segments.at(-1);
  }
  toArray() {
    return [...this.segments];
  }
  isEmpty() {
    return this.segments.length === 0;
  }
  isEqual(other) {
    return this.segments.join('/') === other.segments.join('/');
  }
}
const key = (path) => ({
  path: ResourcePath.fromString(path),
  getCollectionPath() {
    return this.path.popLast();
  },
});
const compare = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      const order = compare(a[index], b[index]);
      if (order) return order;
    }
    return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
};
const T = [100, 50];
const document = (owner, leaf, time = T, collection = 'records') => {
  const path = 'users/' + owner + '/' + collection + '/' + leaf;
  return {
    path,
    key: key(path),
    readTime: time,
    prefixPath: ['users', owner],
    collectionGroup: collection,
    documentId: leaf,
    isFoundDocument() {
      return true;
    },
  };
};
const dbKey = (doc) => [
  doc.prefixPath,
  doc.collectionGroup,
  doc.readTime,
  doc.documentId,
];
const promise = (value) => ({
  next(fn) {
    return promise(fn(value));
  },
  value,
});
const documentMap = () => {
  const values = new Map();
  return {
    insert(key, value) {
      values.set(key.path.toArray().join('/'), value);
      return this;
    },
    values,
  };
};

function tailMethod(source, documents) {
  const ranges = [];
  const reads = [];
  const loadAll = (range) => {
    ranges.push(range);
    const result = documents.filter(
      (doc) =>
        compare(dbKey(doc), range.start) > 0 &&
        compare(dbKey(doc), range.end) <= 0,
    );
    reads.push(...result);
    return promise(result);
  };
  const remoteDocumentsStore = () => ({ Qn: loadAll, loadAll });
  const map = documentMap;
  const method = runInNewContext('({' + source + '})', {
    ResourcePath,
    __PRIVATE_isPipeline: () => false,
    isPipeline: () => false,
    getPipelineCollection: () => {
      throw new Error('Not a pipeline fixture');
    },
    __PRIVATE_toDbTimestampKey: (time) => time,
    toDbTimestampKey: (time) => time,
    __PRIVATE_remoteDocumentsStore: remoteDocumentsStore,
    remoteDocumentsStore,
    __PRIVATE_mutableDocumentMap: map,
    mutableDocumentMap: map,
    DocumentKey: { fromSegments: (segments) => key(segments.join('/')) },
    __PRIVATE_queryOrPipelineMatches: () => true,
    queryOrPipelineMatches: () => true,
    IDBKeyRange: {
      bound(start, end, exclusive) {
        assert.equal(exclusive, true);
        return { start, end };
      },
    },
  });
  method.Ls = method.maybeDecodeDocument = (_key, doc) => doc;
  return {
    ranges,
    reads,
    run(collection, offset) {
      return method.getDocumentsMatchingQuery(
        {},
        { path: ResourcePath.fromString(collection) },
        offset,
        new Set(),
      ).value;
    },
  };
}

for (const filename of filenames) {
  test(
    'native partial-index + tail union is complete and deduplicated: ' +
      filename,
    async () => {
      const source = await sdkSnippet(filename);
      const patched = patchFirestoreLocalIndexBundle(source, filename);
      assert.equal(patchFirestoreLocalIndexBundle(patched, filename), patched);
      assert.equal(
        patched
          .replace(patchedMinified, originalMinified)
          .replace(patchedReadable, originalReadable),
        source,
      );

      const indexed = [
        document('owner-a', 'a'),
        document('owner-a', 'z'),
        document('owner-b', 'a'),
        document('owner-b', 'm'),
        document('owner-c', 'old', [99, 999]),
      ];
      const unindexed = [
        document('owner-b', 'z'),
        document('owner-c', 'a'),
        document('owner-c', 'm'),
        document('owner-c', 'z'),
        document('owner-c', '0-new', [101, 0]),
        document('owner-d', 'a'),
      ];
      const documents = [...indexed, ...unindexed];
      const unrelated = document('owner-c', 'a', T, 'topics');
      const offset = {
        readTime: T,
        documentKey: key('users/owner-b/records/m'),
      };
      const owners = ['owner-a', 'owner-b', 'owner-c', 'owner-d'];
      const executeUnion = (snippet) => {
        const tail = tailMethod(snippet, [...documents, unrelated]);
        const union = new Map(indexed.map((doc) => [doc.path, doc]));
        for (const owner of owners) {
          for (const [path, doc] of tail.run(
            'users/' + owner + '/records',
            offset,
          ).values)
            union.set(path, doc);
        }
        return { tail, union };
      };
      const broken = executeUnion(source);
      assert.equal(
        broken.union.size,
        8,
        'Unpatched SDK must reproduce the three omitted docs',
      );
      for (const path of [
        'users/owner-c/records/a',
        'users/owner-c/records/m',
        'users/owner-d/records/a',
      ]) {
        assert.equal(broken.union.has(path), false);
      }
      const fixed = executeUnion(patched);
      assert.deepEqual(
        [...fixed.union.keys()].sort(),
        documents.map((doc) => doc.path).sort(),
      );
      assert.equal(fixed.union.size, 11);
      assert.equal(
        fixed.tail.reads.length,
        8,
        'Other parents conservatively reread indexed equal-time docs',
      );
      assert.equal(fixed.union.has(unrelated.path), false);
      assert.deepEqual(Array.from(fixed.tail.ranges[1].start[2]), T);
      assert.deepEqual(
        fixed.tail.ranges.map((range) => range.start[3]),
        ['', 'm', '', ''],
      );
      const sameParent = tailMethod(patched, documents).run(
        'users/owner-b/records',
        offset,
      );
      assert.deepEqual(
        [...sameParent.values.keys()],
        ['users/owner-b/records/z'],
      );
      const otherParent = tailMethod(patched, documents).run(
        'users/owner-c/records',
        offset,
      );
      assert.deepEqual(
        [...otherParent.values.keys()],
        [
          'users/owner-c/records/a',
          'users/owner-c/records/m',
          'users/owner-c/records/z',
          'users/owner-c/records/0-new',
        ],
      );

      const emptyKey = key('');
      emptyKey.getCollectionPath = () => {
        throw new Error('Empty cursor must short circuit');
      };
      const empty = tailMethod(patched, documents);
      assert.equal(
        empty.run('users/owner-c/records', {
          readTime: T,
          documentKey: emptyKey,
        }).values.size,
        4,
      );
      assert.equal(
        empty.run('users/owner-c/records', {
          readTime: [0, 0],
          documentKey: emptyKey,
        }).values.size,
        5,
      );
    },
  );
}

test('install patches all full variants including intermediate; repeats are byte-identical and Lite untouched', async (t) => {
  const fixture = await installation(t);
  assert.deepEqual(
    await patchFirestoreLocalIndex({ root: fixture.directory }),
    { inspected: 7, patched: 5, alreadyPatched: 0 },
  );
  const first = await fixture.snapshot();
  for (const [filename, source] of fixture.originals) {
    assert.equal(
      first.get(filename),
      filename.includes('lite/')
        ? source
        : patchFirestoreLocalIndexBundle(source, filename),
    );
  }
  assert.deepEqual(
    await patchFirestoreLocalIndex({ root: fixture.directory }),
    { inspected: 7, patched: 0, alreadyPatched: 5 },
  );
  assert.deepEqual(await fixture.snapshot(), first);
});

test('unsupported versions and package identities fail closed before writing', async (t) => {
  for (const versions of [{ firebase: '12.20.0' }, { firestore: '4.18.0' }]) {
    const fixture = await installation(t, versions);
    await assert.rejects(
      patchFirestoreLocalIndex({ root: fixture.directory }),
      /requires firebase 12.19.0/,
    );
    assert.deepEqual(await fixture.snapshot(), fixture.originals);
  }
  const fixture = await installation(t);
  await fixture.put(
    'node_modules/@firebase/firestore/package.json',
    JSON.stringify({ name: 'other', version: '4.17.2' }),
  );
  await assert.rejects(
    patchFirestoreLocalIndex({ root: fixture.directory }),
    /requires firebase 12.19.0/,
  );
  assert.deepEqual(await fixture.snapshot(), fixture.originals);
});

test('missing, duplicate, mixed, drifted and unknown anchors fail closed', async (t) => {
  const source = await sdkSnippet(filenames[0]);
  const patched = patchFirestoreLocalIndexBundle(source, filenames[0]);
  for (const invalid of [
    '',
    source + source,
    source + patched,
    source.replace('n.readTime', 'n.otherTime'),
    source.replace('_, o, true', '_, o, false'),
  ]) {
    assert.throws(
      () => patchFirestoreLocalIndexBundle(invalid, filenames[0]),
      /exactly one original or patched cursor/,
    );
  }
  assert.throws(
    () => patchFirestoreLocalIndexBundle(source, 'common-future.esm.js'),
    /unsupported distribution/,
  );
  const fixture = await installation(t);
  await fixture.put(
    'node_modules/@firebase/firestore/dist/intermediate/common.js',
    fixture.originals
      .get('intermediate/common.js')
      .replace('_, o, !0', '_, o, !1'),
  );
  const before = await fixture.snapshot();
  await assert.rejects(
    patchFirestoreLocalIndex({ root: fixture.directory }),
    /cursor.range anchor/,
  );
  assert.deepEqual(
    await fixture.snapshot(),
    before,
    'Late intermediate failure must not patch earlier files',
  );
});

test('missing variant, unexpected full bundle and unexpected Lite query engine cannot be skipped', async (t) => {
  const missing = await installation(t);
  // Remove only the verified generated fixture target, never installed SDK files.
  const target = missing.bundlePath('intermediate/common.js');
  assert(target.startsWith(missing.directory + '/'));
  await rm(target);
  await assert.rejects(
    patchFirestoreLocalIndex({ root: missing.directory }),
    /missing distribution variants/,
  );
  assert.equal(
    await readFile(missing.bundlePath(filenames[0]), 'utf8'),
    missing.originals.get(filenames[0]),
    'Missing final variant must not patch earlier files',
  );
  for (const filename of ['common-future.js', 'lite/common-new.js']) {
    const fixture = await installation(t);
    await fixture.put(
      'node_modules/@firebase/firestore/dist/' + filename,
      await sdkSnippet(filenames[0]),
    );
    await assert.rejects(
      patchFirestoreLocalIndex({ root: fixture.directory }),
      /unexpected common bundle/,
    );
    assert.deepEqual(await fixture.snapshot(), fixture.originals);
  }
});

test('prepare patches in production and HUSKY=0 without Git or dev dependencies; errors propagate', async (t) => {
  for (const env of [
    { NODE_ENV: 'production', HUSKY: '1' },
    { NODE_ENV: 'development', HUSKY: '0' },
  ]) {
    const fixture = await installation(t);
    for (const filename of ['prepare.mjs', 'patch-firestore-local-index.mjs']) {
      await fixture.put(
        'scripts/' + filename,
        await readFile(join(root, 'scripts', filename), 'utf8'),
      );
    }
    for (let iteration = 0; iteration < 2; iteration++) {
      const prepared = spawnSync(process.execPath, ['scripts/prepare.mjs'], {
        cwd: fixture.directory,
        env: { ...process.env, ...env },
        encoding: 'utf8',
      });
      assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
      assert(prepared.stdout.includes('patched: ' + (iteration === 0 ? 5 : 0)));
    }
    await fixture.put(
      'node_modules/@firebase/firestore/package.json',
      JSON.stringify({ name: '@firebase/firestore', version: '4.18.0' }),
    );
    const failed = spawnSync(process.execPath, ['scripts/prepare.mjs'], {
      cwd: fixture.directory,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /requires firebase 12.19.0/);
  }
});
