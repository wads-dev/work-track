import type { FirestoreReportRepository } from '../../data/repositories/firestore-report-repository';

/** Keep rendered facts during recalculation only within the same authorized scope.
 * Owner/query/access/deletion checks remain in the view; revocation hides facts immediately. */
export function reportRepositoryMatches(
  direct: boolean,
  current: object | undefined,
  calculated: object | undefined,
): boolean {
  if (!direct || (current !== undefined && current === calculated)) return true;
  const next = current as Partial<FirestoreReportRepository> | undefined;
  const previous = calculated as Partial<FirestoreReportRepository> | undefined;
  return (
    !!next?.projects &&
    !!previous?.projects &&
    !!next.db &&
    !!next.viewer &&
    next.db === previous.db &&
    next.viewer === previous.viewer &&
    next.projects.size === previous.projects.size &&
    [...previous.projects].every(([id, project]) => {
      const currentProject = next.projects!.get(id);
      return (
        !!currentProject &&
        currentProject.type === project.type &&
        currentProject?.createdBy === project.createdBy &&
        currentProject?.confidential === project.confidential &&
        currentProject?.mergedInto === project.mergedInto
      );
    })
  );
}
