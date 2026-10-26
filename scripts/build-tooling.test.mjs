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
import { runInNewContext } from 'node:vm';
import { createServer, loadConfigFromFile } from 'vite';
// Included by the existing explicit npm test/tooling entrypoints.
import './patch-firestore-local-index.test.mjs';
import backendVitest from './build-vitest.config.mjs';
import demoVite from '../docker/firebase/vite.config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = (file) => readFile(join(root, file), 'utf8');

const retiredWebCallables = [
  'createProject',
  'mergeProjects',
  'mergeTopics',
  'moveTopic',
  'getTopicReport',
];

async function retirementScript() {
  const workflow = await source('.github/workflows/deploy-backend.yml');
  const match = workflow.match(
    /node --input-type=module <<'NODE'\n([\s\S]+?)\n {10}NODE/,
  );
  assert(match, 'Workflow must explicitly retire unused Web callables');
  return match[1]
    .replace(/^ {10}/gm, '')
    .replace(/^import \{ execFileSync \} from 'node:child_process';\n/m, '');
}

async function runRetirement(endpoints, failAt) {
  const calls = [];
  const script = await retirementScript();
  runInNewContext(script, {
    console: { log() {} },
    execFileSync(command, args) {
      calls.push({ command, args: Array.from(args) });
      if (args.includes(failAt)) throw new Error('Synthetic CLI failure');
      if (args.includes('functions:list')) {
        return JSON.stringify({ status: 'success', result: endpoints });
      }
    },
  });
  return calls;
}

const deployedCallable = (id, overrides = {}) => ({
  id,
  region: 'southamerica-east1',
  codebase: 'default',
  ...overrides,
});

function assertRetirementCalls(calls, targets) {
  assert.deepEqual(calls[0], {
    command: 'npx',
    args: [
      '-y',
      'firebase-tools@latest',
      'functions:list',
      '--project',
      'wadsworktrack',
      '--json',
      '--non-interactive',
    ],
  });
  assert.equal(calls.length, targets.length === 0 ? 1 : 2);
  if (targets.length > 0) {
    assert.deepEqual(calls[1], {
      command: 'npx',
      args: [
        '-y',
        'firebase-tools@latest',
        'functions:delete',
        ...targets.map((name) => 'default:' + name),
        '--region',
        'southamerica-east1',
        '--project',
        'wadsworktrack',
        '--force',
        '--non-interactive',
      ],
    });
  }
}

test('backend retirement deletes only the configured deployed Web callables in the target region/codebase', async () => {
  const calls = await runRetirement([
    ...retiredWebCallables.map((name) => deployedCallable(name)),
    deployedCallable('mcp'),
    deployedCallable('listCompanyPeople'),
    deployedCallable('exportProjectForDeletion'),
    deployedCallable('deleteProjectPermanently'),
  ]);
  assertRetirementCalls(calls, retiredWebCallables);
});

test('backend retirement is idempotent when all or some Web callables are already absent', async () => {
  for (const endpoints of [
    [],
    [deployedCallable('mcp')],
    retiredWebCallables.map((name) =>
      deployedCallable(name, { region: 'us-central1' }),
    ),
    retiredWebCallables.map((name) =>
      deployedCallable(name, { codebase: 'unrelated' }),
    ),
    [deployedCallable('createProject-helper')],
  ]) {
    assertRetirementCalls(await runRetirement(endpoints), []);
  }
  assertRetirementCalls(
    await runRetirement([
      deployedCallable('mergeTopics', { codebase: undefined }),
      deployedCallable('getTopicReport'),
      deployedCallable('mergeProjects', { region: 'us-central1' }),
      deployedCallable('moveTopic', { codebase: 'unrelated' }),
    ]),
    ['mergeTopics', 'getTopicReport'],
  );
});

test('backend retirement preserves list/delete errors and refuses ambiguous group filters', async () => {
  for (const failAt of ['functions:list', 'functions:delete']) {
    await assert.rejects(
      () => runRetirement([deployedCallable('createProject')], failAt),
      /Synthetic CLI failure/,
    );
  }
  await assert.rejects(() => runRetirement(null), /Unexpected Firebase/);
  await assert.rejects(
    () =>
      runRetirement([
        deployedCallable('createProject'),
        deployedCallable('createProject-helper'),
      ]),
    /refusing broader deletion/,
  );
});

test('backend deploy selects exactly the remaining endpoints without force or broad functions deployment', async () => {
  const workflow = await source('.github/workflows/deploy-backend.yml');
  const command = workflow
    .split('\n')
    .find((line) => line.includes(' deploy '));
  assert(command);
  const selected = command.match(/--only ([^\s]+)/);
  assert(selected);
  assert.deepEqual(selected[1].split(',').sort(), [
    'functions:default:deleteProjectPermanently',
    'functions:default:exportProjectForDeletion',
    'functions:default:listCompanyPeople',
    'functions:default:mcp',
  ]);
  assert(!command.includes('--force'));
  assert(command.includes('--project wadsworktrack --non-interactive'));
  assert(
    workflow.indexOf('Retire unused Web callables') < workflow.indexOf(command),
  );
});
test('Docker uses Alpine and removes installation cache in the same image layer', async () => {
  const dockerfile = await source('docker/firebase/Dockerfile');
  assert.match(dockerfile, /^FROM node:22-alpine$/m);
  assert.match(dockerfile, /apk add --no-cache openjdk21-jre/);
  assert.match(
    dockerfile,
    /RUN npm install[^\n]*firebase-tools@15\.33\.0 \\\s*&& npm cache clean --force/,
  );
  assert.match(await source('docker-compose.yml'), /image: node:22-alpine/);
});

const core = '@work-track/core/registration/domain/project-access';
const data = '@work-track/data/test-support/personal-report-repository';

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
        '/packages/data/src/test-support/personal-report-repository.ts',
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
      '/packages/data/lib/test-support/personal-report-repository.js',
    ),
  );
});

test(
  'Vite transforms refactored app paths, shared source and the PWA module without a listening server',
  { timeout: 30_000 },
  async () => {
    const server = await createServer({
      ...demoVite,
      configFile: false,
      root: join(root, 'apps/frontend'),
      server: {
        ...demoVite.server,
        middlewareMode: true,
        ws: false,
        watch: null,
      },
      optimizeDeps: {
        noDiscovery: true,
        include: [],
        exclude: demoVite.optimizeDeps.exclude,
      },
    });
    try {
      const urls = [
        '/src/main.tsx',
        '/src/features/reports/PersonalPage.tsx',
        '/src/features/records/RecordDrawer.tsx',
        '/src/infrastructure/firebase/callable-command-gateway.ts',
        '/@fs' +
          root +
          'packages/core/src/reports/application/get-personal-report.ts',
        '/@fs' +
          root +
          'packages/data/src/test-support/authorized-report-repository.ts',
      ];
      for (const url of urls) {
        const transformed = await server.transformRequest(url);
        assert(transformed?.code, 'Missing Vite transformation: ' + url);
        assert(
          !transformed.code.includes('/apps/backend/src/'),
          'Browser module imports backend source: ' + url,
        );
      }
      const pwa = await server.environments.client.pluginContainer.resolveId(
        'virtual:pwa-register',
      );
      assert(
        pwa?.id.includes('virtual:pwa-register'),
        'PWA virtual module must resolve after app moves',
      );
    } finally {
      await server.close();
    }
  },
);

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
          "import { ClientPersonalReportRepository } from '@work-track/data/test-support/personal-report-repository';\n" +
          "test('data sees mocked core dependency', async () => {\n" +
          "  const spy = vi.spyOn(access, 'canAccessProject').mockReturnValue(true);\n" +
          "  const record = { id: 'fixture', uid: 'synthetic', projectId: 'missing', deletedAt: null, startedAt: '2026-01-01T00:00:00Z', timeZone: 'UTC', topics: [] };\n" +
          "  const repository = new ClientPersonalReportRepository('synthetic', [record], new Map());\n" +
          "  expect(await repository.loadContext(['synthetic'])).toEqual([{ ...record, timeMultiplier: 1 }]);\n" +
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

test('Functions waits for same-push Firestore and READY indexes before publishing dated queries', async () => {
  const workflow = await source('.github/workflows/deploy-backend.yml');
  assert(workflow.includes('actions: read'));
  assert(
    workflow.includes(
      'uses: actions/checkout@v4\n        with:\n          fetch-depth: 0',
    ),
    'Gate must compare the entire push, not a shallow checkout missing PUSH_BEFORE',
  );
  assert(workflow.includes("'firestore.indexes.json'"));
  assert(workflow.includes('google-github-actions/setup-gcloud@v3'));
  const indexes = workflow.indexOf(
    'run: node scripts/wait-firestore-indexes.mjs wadsworktrack',
  );
  const firestore = workflow.indexOf(
    'run: node scripts/wait-firestore-deploy.mjs',
  );
  const publish = workflow.indexOf('deploy --only functions:default:mcp');
  assert(indexes > 0 && firestore > indexes && publish > firestore);
  assert(workflow.includes('GH_TOKEN: ${{ github.token }}'));
  assert(workflow.includes('PUSH_BEFORE: ${{ github.event.before }}'));
});
