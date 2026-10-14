import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backfill, parseArgs, verifyTotals } from './backfill-project-type.mjs';
function database(rows, conflict = false) {
  const writes = [],
    backups = [];
  const docs = rows.map((data, i) => ({
    data: () => data,
    _fieldsProto: { type: data.type },
    updateTime: { seconds: i, nanoseconds: 0 },
    ref: {
      path: 'projects/p' + i,
      async update(patch, precondition) {
        assert.equal(backups.at(-1).path, this.path);
        assert(precondition.lastUpdateTime);
        if (conflict) throw new Error('concurrent edit');
        writes.push({ path: this.path, patch });
        Object.assign(data, patch);
      },
    },
  }));
  return {
    writes,
    backups,
    async backup(value) {
      backups.push(value);
    },
    collection(name) {
      assert.equal(name, 'projects');
      let start = 0,
        size;
      return {
        orderBy() {
          return this;
        },
        limit(value) {
          size = value;
          return this;
        },
        startAfter(doc) {
          start = docs.indexOf(doc) + 1;
          return this;
        },
        async get() {
          return { docs: docs.slice(start, start + size) };
        },
      };
    },
  };
}
test('dry run paginates all projects and leaves explicit types untouched', async () => {
  const db = database([
    {},
    { type: 'work' },
    { type: 'personal' },
    { type: null },
    {},
  ]);
  assert.deepEqual(await backfill(db, { pageSize: 2 }), {
    scanned: 5,
    missing: 2,
    updated: 0,
    invalid: 1,
  });
  assert.equal(db.writes.length, 0);
});
test('apply backs up before patching only type and is idempotent', async () => {
  const original = {
    confidential: true,
    topics: [{ id: 'general' }],
    createdBy: 'alice',
  };
  const db = database([original, { type: 'personal', confidential: true }]);
  assert.equal(
    (await backfill(db, { apply: true, backup: db.backup })).updated,
    1,
  );
  assert.deepEqual(db.writes[0].patch, { type: 'work' });
  assert.equal(original.confidential, true);
  assert.equal(original.createdBy, 'alice');
  assert.equal(
    (await backfill(db, { apply: true, backup: db.backup })).updated,
    0,
  );
});
test('backup failure and concurrent write abort without overwrite', async () => {
  const db = database([{}]);
  await assert.rejects(
    backfill(db, {
      apply: true,
      backup: async () => {
        throw new Error('disk full');
      },
    }),
    /disk full/,
  );
  assert.equal(db.writes.length, 0);
  const changed = database([{}], true);
  await assert.rejects(
    backfill(changed, { apply: true, backup: changed.backup }),
    /concurrent edit/,
  );
  assert.equal(changed.writes.length, 0);
});
test('deployment refuses missing or invalid type and verification cannot write', () => {
  assert.throws(() => verifyTotals({ missing: 1, invalid: 0 }), /incomplete/);
  assert.throws(() => verifyTotals({ missing: 0, invalid: 1 }), /incomplete/);
  assert.doesNotThrow(() => verifyTotals({ missing: 0, invalid: 0 }));
  assert.throws(
    () =>
      parseArgs([
        '--project',
        'demo-work-track',
        '--apply',
        '--backup',
        'backup',
        '--verify',
      ]),
    /cannot write/,
  );
});

test('explicit project and private backup are required', () => {
  assert.throws(() => parseArgs([]), /project/);
  assert.throws(
    () => parseArgs(['--project', 'demo-work-track', '--apply']),
    /backup/,
  );
  assert.throws(
    () => parseArgs(['--project', 'demo-work-track', '--page-size', '0']),
    /page-size/,
  );
  assert.equal(parseArgs(['--project', 'demo-work-track']).apply, false);
});
