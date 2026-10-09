import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const triggerPaths = new Set([
  'firestore.rules',
  'firestore.indexes.json',
  'firebase.json',
  '.github/workflows/deploy-firestore.yml',
]);
export function requiresFirestoreDeploy(paths) {
  return paths.some((path) => triggerPaths.has(path));
}
export function deploymentState(runs, sha) {
  const matching = runs
    .filter(
      (run) =>
        run.head_sha === sha &&
        run.event === 'push' &&
        run.head_branch === 'main',
    )
    .sort((a, b) => b.id - a.id);
  const run = matching[0];
  if (!run || run.status !== 'completed') return 'pending';
  if (run.conclusion !== 'success')
    throw new Error('Exact-SHA Firestore deployment failed: ' + run.conclusion);
  return 'success';
}
export async function waitForFirestoreDeploy({
  listRuns,
  sha,
  timeoutMs = 20 * 60 * 1000,
  intervalMs = 10000,
  now = Date.now,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (deploymentState(await listRuns(), sha) === 'success') return;
    await pause(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
  throw new Error('Timed out waiting for exact-SHA Firestore deployment.');
}
async function main() {
  const {
    PUSH_BEFORE: before,
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
    GH_TOKEN: token,
  } = process.env;
  if (!before || !sha || !repository || !token)
    throw new Error('Missing deployment gate environment.');
  const paths = execFileSync(
    'git',
    /^0+$/.test(before)
      ? ['ls-tree', '-r', '--name-only', sha]
      : ['diff', '--name-only', before, sha],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n');
  if (!requiresFirestoreDeploy(paths)) {
    console.log('No Firestore deployment-trigger paths changed in this push.');
    return;
  }
  const url = new URL(
    'https://api.github.com/repos/' +
      repository +
      '/actions/workflows/deploy-firestore.yml/runs',
  );
  url.searchParams.set('head_sha', sha);
  url.searchParams.set('event', 'push');
  url.searchParams.set('per_page', '100');
  await waitForFirestoreDeploy({
    sha,
    listRuns: async () => {
      const response = await fetch(url, {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          'GitHub workflow lookup failed: HTTP ' + response.status,
        );
      const result = await response.json();
      if (!Array.isArray(result.workflow_runs))
        throw new Error('Invalid GitHub workflow response.');
      return result.workflow_runs;
    },
  });
  console.log('Firestore deployment succeeded for exact SHA ' + sha + '.');
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
