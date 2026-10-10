import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createServer, loadConfigFromFile } from 'vite';
import backendVitest from './build-vitest.config.mjs';
import demoVite from '../docker/firebase/vite.config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = (file) => readFile(join(root, file), 'utf8');
const core = '@work-track/core/registration/domain/project-access';
const data =
  '@work-track/data/repositories/snapshots/personal-report-repository';

async function resolvedSources(configuration, command = 'serve') {
  const server = await createServer({
    configFile: false,
    root: join(root, 'apps/frontend'),
    mode: command === 'serve' ? 'development' : 'production',
    resolve: configuration.resolve,
    ssr: configuration.ssr,
    server: { middlewareMode: true, ws: false, fs: configuration.server?.fs },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const resolve = (specifier) =>
      server.environments.client.pluginContainer.resolveId(
        specifier,
        join(root, 'apps/frontend/src/main.tsx'),
      );
    const resolved = await Promise.all([resolve(core), resolve(data)]);
    return resolved.map((entry) => entry?.id);
  } finally {
    await server.close();
  }
}

test('Vite development resolves shared source, production resolves built defaults', async () => {
  const development = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    join(root, 'apps/frontend/vite.config.ts'),
  );
  const production = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    join(root, 'apps/frontend/vite.config.ts'),
  );
  assert(development && production);
  for (const configuration of [development.config, demoVite]) {
    const resolved = await resolvedSources(configuration);
    assert(
      resolved[0].endsWith(
        '/packages/core/src/registration/domain/project-access.ts',
      ),
    );
    assert(
      resolved[1].endsWith(
        '/packages/data/src/repositories/snapshots/personal-report-repository.ts',
      ),
    );
    assert(
      configuration.server.fs.allow.some(
        (path) => resolve(path) === resolve(root),
      ),
    );
    assert(configuration.optimizeDeps.exclude.includes('@work-track/core'));
    assert(configuration.optimizeDeps.exclude.includes('@work-track/data'));
  }
  const built = await resolvedSources(production.config, 'build');
  assert(
    built[0].endsWith(
      '/packages/core/lib/registration/domain/project-access.js',
    ),
  );
  assert(
    built[1].endsWith(
      '/packages/data/lib/repositories/snapshots/personal-report-repository.js',
    ),
  );
});

test(
  'Vitest shared source supports spies across the data -> core boundary',
  { timeout: 30_000 },
  async () => {
    const generated = join(root, 'apps/backend/dist');
    await mkdir(generated, { recursive: true });
    const fixture = await realpath(
      await mkdtemp(join(generated, 'tooling-test-')),
    );
    try {
      await writeFile(
        join(fixture, 'shared-source.test.ts'),
        "import { expect, test, vi } from 'vitest';\n" +
          "import * as access from '@work-track/core/registration/domain/project-access';\n" +
          "import { ClientPersonalReportRepository } from '@work-track/data/repositories/snapshots/personal-report-repository';\n" +
          "test('data sees mocked core dependency', async () => {\n" +
          "  const spy = vi.spyOn(access, 'canAccessProject').mockReturnValue(true);\n" +
          "  const record = { id: 'fixture', uid: 'synthetic', projectId: 'missing', startedAt: '2026-01-01T00:00:00Z', timeZone: 'UTC', topics: [] };\n" +
          "  const repository = new ClientPersonalReportRepository('synthetic', [record], new Map());\n" +
          "  expect(await repository.loadContext(['synthetic'])).toEqual([record]);\n" +
          '  expect(spy).toHaveBeenCalledOnce();\n' +
          '});\n',
      );
      assert(backendVitest.resolve.conditions.includes('development'));
      for (const config of [
        'scripts/build-vitest.config.mjs',
        'apps/frontend/vite.config.ts',
      ]) {
        const result = spawnSync(
          process.execPath,
          [
            join(root, 'node_modules/vitest/vitest.mjs'),
            'run',
            '--root',
            fixture,
            '--config',
            join(root, config),
            '--maxWorkers',
            '1',
          ],
          { cwd: root, encoding: 'utf8', timeout: 25_000 },
        );
        assert.equal(
          result.status,
          0,
          config + '\n' + result.stdout + result.stderr,
        );
      }
    } finally {
      assert(
        fixture.startsWith((await realpath(generated)) + '/tooling-test-'),
      );
      await rm(fixture, { recursive: true, force: true });
    }
  },
);

test('Docker and Firebase use explicit shared mounts and standalone Functions', async () => {
  const compose = await source('docker-compose.yml');
  const startup = await source('docker/firebase/start-emulators.sh');
  const rootManifest = JSON.parse(await source('package.json'));
  assert(
    rootManifest.scripts['build:packages'].indexOf('@work-track/core') <
      rootManifest.scripts['build:packages'].indexOf('@work-track/data'),
  );
  assert(compose.includes('./packages:/input/packages:ro'));
  assert(compose.includes('./scripts:/input/scripts:ro'));
  assert(
    compose.indexOf('npm run build:packages') <
      compose.indexOf('npm run dev --workspace'),
  );
  assert(startup.includes('cp -R /input/packages /workspace/packages'));
  assert(startup.includes('/input/scripts/package*.mjs'));
  for (const filename of ['firebase.json', 'firebase.emulators.json']) {
    const config = JSON.parse(await source(filename));
    assert.equal(config.functions[0].source, 'apps/backend/dist/functions');
    assert.equal(config.firestore.rules, 'firestore.rules');
    assert.equal(config.firestore.indexes, 'firestore.indexes.json');
  }
  for (const application of ['backend', 'frontend']) {
    const manifest = JSON.parse(
      await source('apps/' + application + '/package.json'),
    );
    assert.equal(manifest.dependencies['@work-track/core'], '0.1.0');
    assert.equal(manifest.dependencies['@work-track/data'], '0.1.0');
    const workflow = await source(
      '.github/workflows/deploy-' + application + '.yml',
    );
    assert(workflow.includes("- 'packages/**'"));
    if (application === 'backend') {
      for (const name of ['core', 'data', 'backend']) {
        assert(
          workflow.includes('npm test --workspace @work-track/' + name),
          'Functions publication must gate every shared suite',
        );
        assert(
          workflow.indexOf('npm test --workspace @work-track/' + name) <
            workflow.indexOf('google-github-actions/auth@'),
        );
      }
    }
    assert(
      workflow.indexOf('run: npm run build:packages') <
        workflow.indexOf(
          application === 'backend'
            ? 'run: npm run lint'
            : 'run: npm run check',
        ),
    );
  }
});
