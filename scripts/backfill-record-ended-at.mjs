#!/usr/bin/env node
// Run only after nullable readers are deployed. ADC credentials (or emulator) required.
// node scripts/backfill-record-ended-at.mjs --project PROJECT [--database '(default)'] [--page-size 250] [--apply]
import { pathToFileURL } from 'node:url';
import {
  initializeApp,
  applicationDefault,
  deleteApp,
} from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';

export function parseArgs(args) {
  const options = { apply: false, pageSize: 250, database: '(default)' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') options.apply = true;
    else if (['--project', '--database', '--page-size'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--'))
        throw new Error('Missing value for ' + arg);
      if (arg === '--project') options.project = value;
      else if (arg === '--database') options.database = value;
      else options.pageSize = Number(value);
    } else throw new Error('Unknown argument: ' + arg);
  }
  if (!options.project)
    throw new Error('Explicit --project is required (dry run is default).');
  if (
    !Number.isSafeInteger(options.pageSize) ||
    options.pageSize < 1 ||
    options.pageSize > 500
  )
    throw new Error('--page-size must be an integer from 1 to 500.');
  return options;
}

export async function backfill(
  db,
  { apply = false, pageSize = 250 } = {},
  log = console.log,
) {
  const totals = { scanned: 0, missing: 0, updated: 0, skippedConcurrent: 0 };
  let cursor;
  for (;;) {
    let query = db
      .collectionGroup('records')
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const doc of page.docs) {
      // Never touch unrelated collection groups, audit entries or projection copies.
      if (!/^users\/[^/]+\/records\/[^/]+$/.test(doc.ref.path)) continue;
      totals.scanned++;
      if (Object.hasOwn(doc.data(), 'endedAt')) continue;
      totals.missing++;
      log(
        JSON.stringify({
          mode: apply ? 'apply' : 'dry-run',
          path: doc.ref.path,
        }),
      );
      if (apply) {
        const updated = await db.runTransaction(async (tx) => {
          const current = await tx.get(doc.ref);
          if (!current.exists || Object.hasOwn(current.data(), 'endedAt'))
            return false;
          // Only representation changes: timestamps, tombstones, evidence and audit remain untouched.
          tx.update(doc.ref, { endedAt: null });
          return true;
        });
        if (updated) totals.updated++;
        else totals.skippedConcurrent++;
      }
    }
    if (page.docs.length < pageSize) break;
    cursor = page.docs.at(-1);
  }
  return totals;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const app = initializeApp({
    projectId: options.project,
    credential: applicationDefault(),
  });
  try {
    const totals = await backfill(getFirestore(app, options.database), options);
    console.log(
      JSON.stringify({
        project: options.project,
        database: options.database,
        mode: options.apply ? 'apply' : 'dry-run',
        ...totals,
      }),
    );
  } finally {
    await deleteApp(app);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
