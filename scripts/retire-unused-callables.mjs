import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const retiredCallables = Object.freeze([
  'getCalendarReport',
  'getCompanyReport',
  'getPersonalReport',
  'getProjectReport',
  'listProjects',
]);
export function retirementPlan(functions) {
  if (!Array.isArray(functions)) throw new Error('Invalid Functions inventory');
  return functions
    .filter(
      (f) =>
        retiredCallables.includes(f.id) && f.region === 'southamerica-east1',
    )
    .map((f) => f.id)
    .sort();
}
function firebase(args) {
  const result = spawnSync('npx', ['-y', 'firebase-tools@latest', ...args], {
    encoding: 'utf8',
  });
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.stdout || 'Firebase command failed',
    );
  return result.stdout;
}
export function main(args) {
  if (args.some((a) => a !== '--execute') || args.length > 1)
    throw new Error('Use no arguments (preview) or --execute');
  const inventory = JSON.parse(
    firebase(['functions:list', '--project', 'wadsworktrack', '--json']),
  );
  if (inventory.status !== 'success')
    throw new Error('Functions inventory failed');
  const plan = retirementPlan(inventory.result);
  console.log(
    JSON.stringify({
      project: 'wadsworktrack',
      region: 'southamerica-east1',
      retire: plan,
      execute: args.includes('--execute'),
    }),
  );
  if (args.includes('--execute') && plan.length)
    firebase([
      'functions:delete',
      ...plan,
      '--region',
      'southamerica-east1',
      '--project',
      'wadsworktrack',
      '--force',
      '--non-interactive',
    ]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2));
