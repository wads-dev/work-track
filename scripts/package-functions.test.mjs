import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { packageFunctions, standaloneLock } from './package-functions.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('standalone lock preserves nested/peer/optional runtime versions and rejects local links', () => {
  const manifest = {
    name: 'fixture',
    version: '1.0.0',
    dependencies: { a: '1.0.0' },
    engines: { node: '22' },
  };
  const rootLock = {
    lockfileVersion: 3,
    packages: {
      '': { workspaces: ['packages/*'] },
      'node_modules/a': {
        version: '1.0.0',
        dev: true,
        dependencies: { b: '^2' },
        peerDependencies: { c: '^1' },
        optionalDependencies: { absent: '^1' },
      },
      'node_modules/a/node_modules/b': { version: '2.0.0', devOptional: true },
      'node_modules/b': { version: '3.0.0' },
      'node_modules/c': { version: '1.2.0' },
      'node_modules/dev-only': { version: '9.0.0', dev: true },
    },
  };
  const lock = standaloneLock(rootLock, manifest);
  assert.deepEqual(Object.keys(lock.packages).sort(), [
    '',
    'node_modules/a',
    'node_modules/a/node_modules/b',
    'node_modules/c',
  ]);
  assert(!lock.packages['node_modules/a'].dev);
  assert(!lock.packages['node_modules/a/node_modules/b'].devOptional);
  assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
  rootLock.packages['node_modules/a'].dependencies = {
    '@work-track/core': '0.1.0',
  };
  rootLock.packages['node_modules/@work-track/core'] = {
    resolved: 'packages/core',
    link: true,
  };
  assert.throws(
    () => standaloneLock(rootLock, manifest),
    /Local dependency escaped/,
  );
  delete rootLock.packages['node_modules/@work-track/core'];
  assert.throws(
    () => standaloneLock(rootLock, manifest),
    /Missing locked runtime dependency/,
  );
});

test(
  'Functions artifact installs, imports and exposes Firebase runtime metadata outside the workspace',
  { timeout: 120_000 },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'work-track-functions-'));
    const isolated = await realpath(temporary);
    const backendManifestPath = join(root, 'apps/backend/package.json');
    const before = await readFile(backendManifestPath, 'utf8');
    try {
      const result = await packageFunctions({ outputDirectory: isolated });
      const manifest = await json(join(isolated, 'package.json'));
      const lock = await json(join(isolated, 'package-lock.json'));
      assert.equal(
        await readFile(backendManifestPath, 'utf8'),
        before,
        'workspace manifest must not be rewritten',
      );
      assert.equal(manifest.main, 'index.js');
      assert.equal(manifest.type, 'module');
      assert(!manifest.workspaces);
      assert(!manifest.devDependencies);
      assert(!manifest.scripts);
      assert(
        !/@work-track\/|workspace:|file:|link:/.test(
          JSON.stringify({ manifest, lock }),
        ),
      );
      assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
      const rootLock = await json(join(root, 'package-lock.json'));
      for (const name of ['firebase-admin', 'firebase-functions']) {
        assert.equal(
          manifest.dependencies[name],
          rootLock.packages['node_modules/' + name].version,
        );
      }
      const inputs = Object.keys(result.metafile.inputs);
      assert(
        inputs.some((path) => path.startsWith('packages/core/src/')),
        'local core source must be bundled',
      );
      assert(
        inputs.some((path) => path.startsWith('packages/data/src/')),
        'local data source must be bundled',
      );
      assert(
        !inputs.some((path) => path.includes('node_modules/')),
        'third-party npm code must stay external',
      );
      assert(!inputs.some((path) => path.endsWith('.test.ts')));
      for (const output of Object.values(result.metafile.outputs)) {
        for (const imported of output.imports) {
          assert(imported.external);
          assert(!imported.path.startsWith('@work-track/'));
          assert(!imported.path.startsWith('.'));
        }
      }
      const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        npm_config_cache:
          process.env.npm_config_cache || join(isolated, '.npm-cache'),
        GCLOUD_PROJECT: 'demo-work-track',
        GOOGLE_CLOUD_PROJECT: 'demo-work-track',
        FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-work-track' }),
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:1',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:1',
      };
      const installed = spawnSync(
        'npm',
        [
          'ci',
          '--prefer-offline',
          '--ignore-scripts',
          '--omit=dev',
          '--no-audit',
          '--no-fund',
        ],
        { cwd: isolated, env, encoding: 'utf8', timeout: 90_000 },
      );
      assert.equal(installed.status, 0, installed.stdout + installed.stderr);
      const imported = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "const f = await import('./index.js'); console.log(JSON.stringify(Object.keys(f).sort()))",
        ],
        { cwd: isolated, env, encoding: 'utf8', timeout: 15_000 },
      );
      assert.equal(imported.status, 0, imported.stdout + imported.stderr);
      const exportedNames = JSON.parse(imported.stdout.trim());
      assert(exportedNames.includes('api'));
      assert(exportedNames.includes('health'));
      const discovered = spawnSync(
        process.execPath,
        ['node_modules/firebase-functions/lib/bin/firebase-functions.js'],
        {
          cwd: isolated,
          env: {
            ...env,
            FUNCTIONS_MANIFEST_OUTPUT_PATH: join(
              isolated,
              'functions-manifest.json',
            ),
          },
          encoding: 'utf8',
          timeout: 15_000,
        },
      );
      assert.equal(discovered.status, 0, discovered.stdout + discovered.stderr);
      const runtime = await json(join(isolated, 'functions-manifest.json'));
      assert.deepEqual(Object.keys(runtime.endpoints).sort(), exportedNames);
      assert(runtime.endpoints.api.httpsTrigger);
      assert(runtime.endpoints.getPersonalReport.callableTrigger);
    } finally {
      // This canonical path is the fresh mkdtemp fixture owned by this test only.
      assert(
        isolated.startsWith(
          (await realpath(tmpdir())) + '/work-track-functions-',
        ),
      );
      await rm(isolated, { recursive: true, force: true });
    }
  },
);
