import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Firebase 12.19.0 / Firestore 4.17.2 use a collection-group index offset
// for each parent's collection tail. Its leaf is only a valid exclusive bound
// in its own collection. Other parents must include ALL equal-readTime docs:
// the native indexed/tail union already deduplicates by full document key.
// Keep indexes, query predicates, readTime, and the exclusive range unchanged.
const lines = (values) => values.join(String.fromCharCode(10));
const minifiedCursor =
  'n.documentKey.path.isEmpty() ? "" : n.documentKey.path.lastSegment()';
const minifiedFixedCursor =
  'n.documentKey.path.isEmpty() || !n.documentKey.getCollectionPath().isEqual(s) ? "" : n.documentKey.path.lastSegment()';
const minifiedPrefix = lines([
  '    getDocumentsMatchingQuery(e, t, n, r, i) {',
  '        const s = __PRIVATE_isPipeline(t) ? ResourcePath.fromString(getPipelineCollection(t)) : t.path, _ = [ s.popLast().toArray(), s.lastSegment(), __PRIVATE_toDbTimestampKey(n.readTime), ',
]);
const minifiedSuffix = lines([
  ' ], o = [ s.popLast().toArray(), s.lastSegment(), [ Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER ], "" ];',
  '        return __PRIVATE_remoteDocumentsStore(e).Qn(IDBKeyRange.bound(_, o, ',
]);
const readableCursor = lines([
  'offset.documentKey.path.isEmpty()',
  "                ? ''",
  '                : offset.documentKey.path.lastSegment()',
]);
const readableFixedCursor = readableCursor.replace(
  'offset.documentKey.path.isEmpty()',
  'offset.documentKey.path.isEmpty() || !offset.documentKey.getCollectionPath().isEqual(collection)',
);
const readablePrefix = lines([
  '    getDocumentsMatchingQuery(transaction, query, offset, mutatedDocs, context) {',
  '        const collection = isPipeline(query)',
  '            ? ResourcePath.fromString(getPipelineCollection(query))',
  '            : query.path;',
  '        const startKey = [',
  '            collection.popLast().toArray(),',
  '            collection.lastSegment(),',
  '            toDbTimestampKey(offset.readTime),',
  '            ',
]);
const readableSuffix = lines([
  '',
  '        ];',
  '        const endKey = [',
  '            collection.popLast().toArray(),',
  '            collection.lastSegment(),',
  '            [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],',
  "            ''",
  '        ];',
  '        return remoteDocumentsStore(transaction)',
  '            .loadAll(IDBKeyRange.bound(startKey, endKey, true))',
]);

// Hashed filenames and exact method/range anchors pin the distribution, not
// arbitrary SDK code. An upgrade must be reviewed, never silently skipped.
const variants = new Map([
  ['common-CLMydGSF.esm.js', 'true'],
  ['common-CHRxpN5I.cjs.js', 'true'],
  ['common-CzMvp0wA.rn.js', '!0'],
  ['intermediate/common.js', '!0'],
  ['common-B30b72EX.node.cjs.js', null],
]);
const occurrences = (source, text) => source.split(text).length - 1;
const failure = (message) =>
  new Error('Firestore local-index patch: ' + message);

export function patchFirestoreLocalIndexBundle(source, filename) {
  if (!variants.has(filename)) {
    throw failure('unsupported distribution variant: ' + filename);
  }
  const minified = variants.get(filename);
  const cursor = minified === null ? readableCursor : minifiedCursor;
  const fixedCursor =
    minified === null ? readableFixedCursor : minifiedFixedCursor;
  const prefix = minified === null ? readablePrefix : minifiedPrefix;
  const suffix =
    minified === null ? readableSuffix : minifiedSuffix + minified + ')).next';
  const originalCount = occurrences(source, prefix + cursor + suffix);
  const fixedCount = occurrences(source, prefix + fixedCursor + suffix);
  if (
    originalCount + fixedCount !== 1 ||
    occurrences(source, cursor) !== originalCount ||
    occurrences(source, fixedCursor) !== fixedCount
  ) {
    throw failure(
      'expected exactly one original or patched cursor/range anchor in ' +
        filename,
    );
  }
  return originalCount === 1 ? source.replace(cursor, fixedCursor) : source;
}

async function commonBundles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await commonBundles(path)));
    else if (
      entry.isFile() &&
      entry.name.startsWith('common') &&
      entry.name.endsWith('.js')
    )
      files.push(path);
  }
  return files.sort();
}

export async function patchFirestoreLocalIndex({ root = process.cwd() } = {}) {
  const modules = join(resolve(root), 'node_modules');
  const firestore = join(modules, '@firebase/firestore');
  const firebasePackage = JSON.parse(
    await readFile(join(modules, 'firebase/package.json'), 'utf8'),
  );
  const firestorePackage = JSON.parse(
    await readFile(join(firestore, 'package.json'), 'utf8'),
  );
  if (
    firebasePackage.name !== 'firebase' ||
    firebasePackage.version !== '12.19.0' ||
    firebasePackage.dependencies?.['@firebase/firestore'] !== '4.17.2' ||
    firestorePackage.name !== '@firebase/firestore' ||
    firestorePackage.version !== '4.17.2'
  ) {
    throw failure(
      'requires firebase 12.19.0 / @firebase/firestore 4.17.2; found ' +
        firebasePackage.version +
        ' / ' +
        firestorePackage.version,
    );
  }
  const dist = join(firestore, 'dist');
  const planned = [];
  const seen = new Set();
  const files = await commonBundles(dist);
  for (const path of files) {
    const filename = relative(dist, path).split(sep).join('/');
    const source = await readFile(path, 'utf8');
    if (!variants.has(filename)) {
      // Lite has no persistent local-cache query engine. Inspect it too, but
      // never patch unrelated leaf expressions or silently accept a new engine.
      if (
        !(
          filename.startsWith('lite/') ||
          filename.startsWith('intermediate/lite/')
        ) ||
        source.includes('getDocumentsMatchingQuery')
      ) {
        throw failure('unexpected common bundle: ' + filename);
      }
      continue;
    }
    const patched = patchFirestoreLocalIndexBundle(source, filename);
    seen.add(filename);
    planned.push({ path, source, patched });
  }
  const missing = [...variants.keys()].filter(
    (filename) => !seen.has(filename),
  );
  if (missing.length)
    throw failure('missing distribution variants: ' + missing.join(', '));

  // Validate ALL variants before writing ANY: an incompatible install fails
  // closed rather than leaving only the browser or Node build patched.
  let patched = 0;
  for (const bundle of planned) {
    if (bundle.source !== bundle.patched) {
      await writeFile(bundle.path, bundle.patched);
      patched++;
    }
  }
  return {
    inspected: files.length,
    patched,
    alreadyPatched: planned.length - patched,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await patchFirestoreLocalIndex();
  console.log(basename(fileURLToPath(import.meta.url)) + ':', result);
}
