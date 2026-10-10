export function archivedProject(project: Record<string, unknown> | undefined) {
  return (
    !!project &&
    (project.archived === true || typeof project.mergedInto === 'string')
  );
}
export function matchesArchive(
  project: Record<string, unknown> | undefined,
  filter: string,
) {
  const archived = archivedProject(project);
  return filter === 'all' || (filter === 'archived' ? archived : !archived);
}
