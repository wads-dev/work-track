export interface ReportRecord {
  id: string;
  projectId: string;
  uid: string;
  startedAt: string;
  endedAt?: string;
}
// Internal port only; project-wide authorization is not exposed yet.
export interface ReportRecordsRepository {
  listByProject(
    projectId: string,
    limit: number,
    viewerUid?: string,
  ): Promise<ReportRecord[]>;
}
