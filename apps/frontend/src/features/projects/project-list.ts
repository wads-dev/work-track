import { text, type Row } from '../../shared/data';

const projectNames = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** Sort displayed (privacy-safe) names without mutating the shared catalog. */
export function sortProjectRows(rows: readonly Row[]): Row[] {
  return [...rows].sort(
    (a, b) =>
      projectNames.compare(
        text(a.data.title).trim(),
        text(b.data.title).trim(),
      ) || a.id.localeCompare(b.id),
  );
}

export function clearProjectFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('q');
  next.delete('project');
  next.delete('status');
  return next;
}

export type { ProjectReadOptions } from '../../data/repositories/browser-listing-repository';
// Shared query parameter only; project dataset selection is repository-owned.
export type ProjectScope = 'all' | 'personal' | 'work';
export type ProjectPage = {
  projects: Record<string, unknown>[];
  nextCursor?: string | null;
};
export async function loadAllProjects(
  fetchPage: (cursor?: string) => Promise<ProjectPage>,
): Promise<Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    result.push(...page.projects);
    if (!page.nextCursor) return result;
    if (seen.has(page.nextCursor))
      throw new Error('Paginação de projetos inconsistente.');
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return result;
}
