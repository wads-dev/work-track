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
