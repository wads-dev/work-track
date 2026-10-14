import { stableDataKey } from '../../data/repositories/stable-data-key';

/** Keep old facts during record refresh only while the authorized project catalog
 * is unchanged. Check during render: effects are too late after revocation. */
export function reportRepositoryMatches(
  direct: boolean,
  current:
    | { db?: unknown; viewer?: string; projects?: ReadonlyMap<string, unknown> }
    | undefined,
  calculated: typeof current,
): boolean {
  if (!direct || (current !== undefined && current === calculated)) return true;
  if (
    !current?.projects ||
    !calculated?.projects ||
    !current.db ||
    !current.viewer
  )
    return false;
  const catalog = (projects: ReadonlyMap<string, unknown>) =>
    stableDataKey([...projects].sort(([a], [b]) => a.localeCompare(b)));
  return (
    current.db === calculated.db &&
    current.viewer === calculated.viewer &&
    catalog(current.projects) === catalog(calculated.projects)
  );
}
