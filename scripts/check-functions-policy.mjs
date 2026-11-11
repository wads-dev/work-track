import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Frozen legacy surface, not an extension point. New business capabilities are MCP tools.
export const legacyFunctions = Object.freeze([
  'deleteProjectPermanently',
  'exportProjectForDeletion',
  'listCompanyPeople',
]);
export function assertFunctionsPolicy(exports) {
  const allowed = new Set(['mcp', ...legacyFunctions]);
  const unexpected = Object.keys(exports).filter((name) => !allowed.has(name));
  if (unexpected.length)
    throw new Error(
      'Novas Cloud Functions proibidas: ' +
        unexpected.sort().join(', ') +
        '. Implemente ferramentas dentro de mcp; não amplie a lista legada.',
    );
  if (typeof exports.mcp !== 'function' || !exports.mcp.__endpoint)
    throw new Error('Endpoint Firebase mcp obrigatório.');
  for (const [name, value] of Object.entries(exports)) {
    if (typeof value !== 'function' || !value.__endpoint)
      throw new Error('Export Firebase inválido: ' + name);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const entry = resolve('apps/backend/lib/index.js');
    assertFunctionsPolicy(await import(pathToFileURL(entry).href));
    console.log(
      'Functions policy OK: somente mcp e exceções legadas congeladas.',
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
