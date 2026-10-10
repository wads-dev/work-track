import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory()
      ? sources(path)
      : /\.tsx?$/.test(entry.name)
        ? [path]
        : [];
  });
}
function imports(path) {
  return [
    ...readFileSync(path, 'utf8').matchAll(
      /(?:from\s*|import\s*\(|import\s*)(['"])([^'"]+)\1/g,
    ),
  ].map((match) => match[2]);
}
test('shared packages cannot import runtimes, apps, SDKs or browser state', () => {
  for (const name of ['core', 'data']) {
    for (const path of sources(resolve(root, 'packages', name, 'src'))) {
      for (const spec of imports(path)) {
        assert(
          !/^(?:node:|firebase(?:-admin|-functions)?(?:\/|$)|react(?:-dom)?(?:\/|$)|express$|@modelcontextprotocol\/)/.test(
            spec,
          ),
          relative(root, path) + ': ' + spec,
        );
        assert(!spec.includes('/apps/'), relative(root, path) + ': ' + spec);
        if (name === 'core')
          assert(
            !spec.startsWith('@work-track/data'),
            'core must not depend on data',
          );
        if (spec.startsWith('.')) {
          const target = resolve(dirname(path), spec);
          assert(
            target.startsWith(resolve(root, 'packages', name) + '/'),
            'relative import escapes package: ' + spec,
          );
        }
      }
      if (!path.includes('.test.'))
        assert(
          !/\b(?:window|localStorage|sessionStorage)\b/.test(
            readFileSync(path, 'utf8'),
          ),
          'browser global in shared package: ' + path,
        );
    }
  }
});
test('apps use public package exports, never sibling source or package deep imports', () => {
  for (const app of ['backend', 'frontend']) {
    for (const path of sources(resolve(root, 'apps', app, 'src'))) {
      for (const spec of imports(path)) {
        assert(
          !/\/(?:backend|frontend)\/src\//.test(spec),
          relative(root, path) + ': ' + spec,
        );
        assert(
          !spec.includes('/packages/'),
          relative(root, path) + ': ' + spec,
        );
        if (spec.startsWith('@work-track/')) {
          const parts = spec.split('/');
          assert(['core', 'data'].includes(parts[1]));
          const pkg = JSON.parse(
            readFileSync(
              resolve(root, 'packages', parts[1], 'package.json'),
              'utf8',
            ),
          );
          assert(
            pkg.exports['./' + parts.slice(2).join('/')],
            'undeclared public export: ' + spec,
          );
        }
      }
    }
  }
});
test('all public package exports load as compiled ESM without a source loader', async () => {
  for (const name of ['core', 'data']) {
    const pkg = JSON.parse(
      readFileSync(resolve(root, 'packages', name, 'package.json'), 'utf8'),
    );
    for (const key of Object.keys(pkg.exports)) {
      const specifier = '@work-track/' + name + key.slice(1);
      await assert.doesNotReject(() => import(specifier), specifier);
    }
    for (const privatePath of [
      'src/private-module',
      'lib/private-module',
      'package.json',
    ]) {
      await assert.rejects(
        () => import('@work-track/' + name + '/' + privatePath),
        { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' },
      );
    }
  }
});

test('package exports explicitly pair source, declarations and runnable JavaScript', () => {
  for (const name of ['core', 'data']) {
    const dir = resolve(root, 'packages', name);
    const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.type, 'module');
    assert(
      !Object.keys(pkg.exports).some((key) => key.includes('*')),
      'exports must be explicit',
    );
    for (const [key, entry] of Object.entries(pkg.exports)) {
      for (const condition of ['types', 'development', 'default'])
        assert(
          existsSync(resolve(dir, entry[condition])),
          name + key + ' missing ' + condition,
        );
      assert(entry.types.endsWith('.d.ts'));
      assert(entry.default.endsWith('.js'));
    }
    assert(
      !Object.keys(pkg.dependencies).some((dependency) =>
        /^(?:firebase|react|express|@modelcontextprotocol)/.test(dependency),
      ),
    );
  }
});
