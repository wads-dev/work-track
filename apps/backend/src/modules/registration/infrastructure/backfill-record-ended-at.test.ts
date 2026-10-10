import { expect, it } from 'vitest';
// The operational script is intentionally import-safe: no credentials or writes on import.
// prettier-ignore
// @ts-expect-error standalone operational JavaScript has no declaration file
import * as script from '../../../../../../scripts/backfill-record-ended-at.mjs';
const { backfill, parseArgs } = script as {
  backfill: (
    db: unknown,
    options: { apply?: boolean; pageSize?: number },
    log: () => void,
  ) => Promise<Record<string, number>>;
  parseArgs: (args: string[]) => { apply: boolean };
};

function fixture(concurrentClose = false) {
  const values = new Map<string, Record<string, unknown>>([
    ['users/a/records/a', { originalText: 'evidence', recordedAt: 'time' }],
    ['users/a/records/b', { endedAt: null }],
    ['users/a/records/c', { endedAt: '2026-10-09T10:00:00Z' }],
    ['users/a/records/d', { deletedAt: 'time', fingerprint: 'immutable' }],
    ['other/a/records/e', { originalText: 'unrelated' }],
  ]);
  const writes: unknown[] = [];
  const docs = [...values.keys()]
    .sort()
    .map((path) => ({ ref: { path }, data: () => values.get(path) }));
  let cursor: (typeof docs)[number] | undefined;
  let size = 0;
  const query = {
    orderBy: () => query,
    limit: (n: number) => {
      size = n;
      return query;
    },
    startAfter: (doc: (typeof docs)[number]) => {
      cursor = doc;
      return query;
    },
    get: () =>
      Promise.resolve({
        docs: docs
          .filter((doc) => !cursor || doc.ref.path > cursor.ref.path)
          .slice(0, size),
      }),
  };
  const db = {
    collectionGroup: () => {
      cursor = undefined;
      return query;
    },
    runTransaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          get: (ref: { path: string }) => {
            if (concurrentClose && ref.path === 'users/a/records/a')
              values.set(ref.path, {
                ...values.get(ref.path),
                endedAt: 'concurrent-end',
              });
            return Promise.resolve({
              exists: values.has(ref.path),
              data: () => values.get(ref.path),
            });
          },
          update: (ref: { path: string }, patch: Record<string, unknown>) => {
            writes.push(patch);
            values.set(ref.path, { ...values.get(ref.path), ...patch });
          },
        }),
      ),
  };
  return { db, values, writes };
}

it('rechecks missing fields transactionally and preserves concurrent closure', async () => {
  const f = fixture(true);
  expect(
    await backfill(f.db, { apply: true, pageSize: 2 }, () => {}),
  ).toMatchObject({ updated: 1, skippedConcurrent: 1 });
  expect(f.values.get('users/a/records/a')?.endedAt).toBe('concurrent-end');
});

it('requires explicit target and apply; rejects invalid flags', () => {
  expect(parseArgs(['--project', 'demo']).apply).toBe(false);
  expect(parseArgs(['--project', 'demo', '--apply']).apply).toBe(true);
  for (const args of [
    [],
    ['--project'],
    ['--project', 'demo', '--page-size', '0'],
    ['--project', 'demo', '--unknown'],
  ])
    expect(() => parseArgs(args)).toThrow();
});
it('paginates dry run, applies only missing fields and is idempotent preserving facts', async () => {
  const f = fixture();
  const before = structuredClone([...f.values]);
  expect(await backfill(f.db, { pageSize: 2 }, () => {})).toMatchObject({
    scanned: 4,
    missing: 2,
    updated: 0,
  });
  expect([...f.values]).toEqual(before);
  expect(f.writes).toEqual([]);
  expect(
    await backfill(f.db, { pageSize: 2, apply: true }, () => {}),
  ).toMatchObject({ updated: 2 });
  expect(f.writes).toEqual([{ endedAt: null }, { endedAt: null }]);
  expect(f.values.get('users/a/records/a')).toEqual({
    originalText: 'evidence',
    recordedAt: 'time',
    endedAt: null,
  });
  expect(f.values.get('users/a/records/d')).toEqual({
    deletedAt: 'time',
    fingerprint: 'immutable',
    endedAt: null,
  });
  expect(f.values.get('other/a/records/e')).toEqual({
    originalText: 'unrelated',
  });
  expect(
    await backfill(f.db, { pageSize: 2, apply: true }, () => {}),
  ).toMatchObject({ missing: 0, updated: 0 });
});
