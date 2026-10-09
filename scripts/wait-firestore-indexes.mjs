import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export function indexesPath(group, pageToken) {
  return (
    '/collectionGroups/' +
    encodeURIComponent(group) +
    '/indexes' +
    (pageToken ? '?pageToken=' + encodeURIComponent(pageToken) : '')
  );
}
export function matchingReadyIndex(required, actual) {
  const fields = (list) =>
    list
      .filter((f) => f.fieldPath !== '__name__')
      .map((f) => [f.fieldPath, f.order ?? null, f.arrayConfig ?? null]);
  return (
    actual.queryScope === required.queryScope &&
    actual.state === 'READY' &&
    JSON.stringify(fields(actual.fields)) ===
      JSON.stringify(fields(required.fields))
  );
}
export async function waitForIndexes(project, timeoutMs = 20 * 60_000) {
  if (!/^[a-z][a-z0-9-]+$/.test(project ?? ''))
    throw new Error('Explicit project ID required');
  const config = JSON.parse(
    await readFile(
      new URL('../firestore.indexes.json', import.meta.url),
      'utf8',
    ),
  );
  const base =
    'https://firestore.googleapis.com/v1/projects/' +
    project +
    '/databases/(default)';
  const get = async (path) => {
    const token = execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8',
    }).trim();
    const response = await fetch(base + path, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!response.ok)
      throw new Error(
        'Firestore readiness request failed: HTTP ' +
          response.status +
          ' ' +
          (await response.text()),
      );
    return response.json();
  };
  const database = await get('');
  console.log(
    'Target database:',
    database.name,
    'edition:',
    database.databaseEdition ?? 'unspecified',
  );
  if (database.databaseEdition !== 'STANDARD')
    throw new Error(
      'Release gate expects confirmed STANDARD edition; review indexes before publishing',
    );
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const missing = [];
    for (const group of [
      ...new Set(config.indexes.map((i) => i.collectionGroup)),
    ]) {
      const actual = [];
      let pageToken;
      do {
        const page = await get(indexesPath(group, pageToken));
        actual.push(...(page.indexes ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      for (const required of config.indexes.filter(
        (i) => i.collectionGroup === group,
      ))
        if (!actual.some((i) => matchingReadyIndex(required, i)))
          missing.push(required);
    }
    if (!missing.length) {
      console.log(
        'All configured composite indexes are READY. Hosting may publish.',
      );
      return;
    }
    if (Date.now() >= deadline)
      throw new Error(
        'Indexes not READY before deadline: ' + JSON.stringify(missing),
      );
    console.log(
      'Waiting for',
      missing.length,
      'configured indexes to become READY.',
    );
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await waitForIndexes(process.argv[2]);
}
