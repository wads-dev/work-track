import { build } from 'esbuild';
import { isBuiltin } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const localDependency = (name, version) =>
  name.startsWith('@work-track/') || /^(workspace:|file:|link:)/.test(version);
const packageName = (specifier) =>
  specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n');

// Project the exact runtime graph from the committed root lock. No registry
// resolution, fresh dependency versions, workspace links or dev tooling ship.
export function standaloneLock(rootLock, manifest) {
  const source = rootLock.packages;
  if (rootLock.lockfileVersion !== 3 || !source) {
    throw new Error('Functions packaging requires a v3 root package-lock.json');
  }
  const selected = new Map();
  const locate = (name, from = '') => {
    let directory = from;
    for (;;) {
      const candidate = posix.join(directory, 'node_modules', name);
      if (source[candidate]) return candidate;
      if (!directory) return undefined;
      directory = posix.dirname(directory);
      if (directory === '.') directory = '';
      if (posix.basename(directory) === 'node_modules') {
        directory = posix.dirname(directory);
        if (directory === '.') directory = '';
      }
    }
  };
  const visit = (name, from, optional = false) => {
    const path = locate(name, from);
    if (!path) {
      if (optional) return;
      throw new Error('Missing locked runtime dependency: ' + name);
    }
    if (selected.has(path)) return;
    const entry = source[path];
    if (entry.link || localDependency(name, entry.resolved ?? '')) {
      throw new Error('Local dependency escaped Functions bundle: ' + name);
    }
    if (!path.startsWith('node_modules/')) {
      throw new Error(
        'Runtime dependencies must be hoisted in root lock: ' + path,
      );
    }
    const clean = { ...entry };
    delete clean.dev;
    delete clean.devOptional;
    selected.set(path, clean);
    for (const dependency of Object.keys(entry.dependencies ?? {})) {
      visit(dependency, path, dependency in (entry.optionalDependencies ?? {}));
    }
    for (const dependency of Object.keys(entry.optionalDependencies ?? {})) {
      visit(dependency, path, true);
    }
    for (const dependency of Object.keys(entry.peerDependencies ?? {})) {
      visit(
        dependency,
        path,
        entry.peerDependenciesMeta?.[dependency]?.optional === true,
      );
    }
  };
  for (const dependency of Object.keys(manifest.dependencies)) {
    visit(dependency, '');
  }
  return {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: manifest.name,
        version: manifest.version,
        dependencies: manifest.dependencies,
        engines: manifest.engines,
      },
      ...Object.fromEntries(
        [...selected].sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
  };
}

export async function packageFunctions({
  root = repositoryRoot,
  outputDirectory = join(root, 'apps/backend/dist/functions'),
} = {}) {
  const backend = await readJson(join(root, 'apps/backend/package.json'));
  const rootManifest = await readJson(join(root, 'package.json'));
  const rootLock = await readJson(join(root, 'package-lock.json'));
  const dependencies = {};
  for (const manifest of [
    backend,
    await readJson(join(root, 'packages/core/package.json')),
    await readJson(join(root, 'packages/data/package.json')),
  ]) {
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      if (localDependency(name, version)) continue;
      const locked = rootLock.packages['node_modules/' + name];
      if (!locked?.version || locked.link) {
        throw new Error('Missing locked third-party dependency: ' + name);
      }
      dependencies[name] = locked.version;
    }
  }
  const manifest = {
    name: 'work-track-functions',
    version: backend.version,
    private: true,
    type: 'module',
    main: 'index.js',
    engines: backend.engines,
    dependencies: Object.fromEntries(
      Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)),
    ),
    ...(rootManifest.overrides ? { overrides: rootManifest.overrides } : {}),
  };
  const lock = standaloneLock(rootLock, manifest);
  await mkdir(outputDirectory, { recursive: true });
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['apps/backend/src/index.ts'],
    outfile: join(outputDirectory, manifest.main),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    conditions: ['development'],
    external: Object.keys(dependencies),
    sourcemap: true,
    metafile: true,
    logLevel: 'warning',
  });
  if (
    Object.keys(result.metafile.inputs).some((path) =>
      path.includes('node_modules/'),
    )
  ) {
    throw new Error(
      'Third-party npm code must be external to the Functions bundle',
    );
  }
  for (const output of Object.values(result.metafile.outputs)) {
    for (const imported of output.imports) {
      if (
        !isBuiltin(imported.path) &&
        !manifest.dependencies[packageName(imported.path)]
      ) {
        throw new Error(
          'Undeclared Functions runtime import: ' + imported.path,
        );
      }
    }
  }
  await writeJson(join(outputDirectory, 'package.json'), manifest);
  await writeJson(join(outputDirectory, 'package-lock.json'), lock);
  await writeJson(join(outputDirectory, 'build-meta.json'), result.metafile);
  return { outputDirectory, manifest, lock, metafile: result.metafile };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length > 2)
    throw new Error('package-functions accepts no CLI arguments');
  const result = await packageFunctions();
  console.log('Standalone Functions artifact: ' + result.outputDirectory);
}
