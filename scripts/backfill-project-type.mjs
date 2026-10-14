#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { open, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { serialize } from 'node:v8';
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
    else if (arg === '--verify') options.verify = true;
    else if (
      ['--project', '--database', '--page-size', '--backup'].includes(arg)
    ) {
      const value = args[++i];
      if (!value || value.startsWith('--'))
        throw new Error('Missing value for ' + arg);
      if (arg === '--page-size') options.pageSize = Number(value);
      else options[arg.slice(2)] = value;
    } else throw new Error('Unknown argument: ' + arg);
  }
  if (!options.project)
    throw new Error('Explicit --project required. Dry run is default.');
  if (
    !Number.isSafeInteger(options.pageSize) ||
    options.pageSize < 1 ||
    options.pageSize > 500
  )
    throw new Error('--page-size must be an integer from 1 to 500.');
  if (options.apply && !options.backup)
    throw new Error('--apply requires --backup (new private file).');
  if (options.apply && options.verify)
    throw new Error('--verify cannot write.');
  return options;
}

export function verifyTotals(totals) {
  if (totals.missing || totals.invalid)
    throw new Error('Project type migration incomplete; deployment refused.');
}

/** Scan all top-level projects: Firestore cannot query field absence. */
export async function backfill(
  db,
  { apply = false, pageSize = 250, backup } = {},
) {
  if (apply && !backup)
    throw new Error('Durable backup callback required before writing.');
  const totals = { scanned: 0, missing: 0, updated: 0, invalid: 0 };
  let cursor;
  for (;;) {
    let query = db
      .collection('projects')
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const doc of page.docs) {
      totals.scanned++;
      const data = doc.data();
      if (Object.hasOwn(data, 'type')) {
        if (!['work', 'personal'].includes(data.type)) totals.invalid++;
        continue;
      }
      totals.missing++;
      if (!apply) continue;
      // Lossless Firestore protobuf representation and update time precede every write.
      await backup({
        path: doc.ref.path,
        updateTime: {
          seconds: doc.updateTime.seconds,
          nanoseconds: doc.updateTime.nanoseconds,
        },
        data: doc._fieldsProto,
      });
      // Fail on concurrent edits instead of replacing data or silently skipping a project.
      await doc.ref.update(
        { type: 'work' },
        { lastUpdateTime: doc.updateTime },
      );
      totals.updated++;
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
  let file;
  try {
    if (options.apply) {
      await mkdir(dirname(options.backup), { recursive: true, mode: 0o700 });
      file = await open(options.backup, 'wx', 0o600);
      await file.write(
        JSON.stringify({
          project: options.project,
          database: options.database,
          createdAt: new Date().toISOString(),
        }) + '\n',
      );
      await file.sync();
    }
    const backup = file
      ? async (entry) => {
          // V8 serialization preserves byte values in Firestore protobuf fields.
          await file.write(
            JSON.stringify({
              path: entry.path,
              payload: serialize(entry).toString('base64'),
            }) + '\n',
          );
          await file.sync();
        }
      : undefined;
    const totals = await backfill(getFirestore(app, options.database), {
      ...options,
      backup,
    });
    console.log(
      JSON.stringify({
        project: options.project,
        database: options.database,
        mode: options.apply ? 'apply' : 'dry-run',
        ...totals,
      }),
    );
    if (options.verify) verifyTotals(totals);
    if (totals.invalid)
      throw new Error(
        'Invalid explicit project types found; do not deploy strict readers until reviewed.',
      );
  } finally {
    await file?.close();
    await deleteApp(app);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
