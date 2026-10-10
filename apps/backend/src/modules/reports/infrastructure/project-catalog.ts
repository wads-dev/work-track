import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import type { Firestore } from 'firebase-admin/firestore';
import {
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { ProjectCatalogRepository } from '@work-track/data/repositories/project-catalog-repository';
import type { ReportProjectMetadata } from '@work-track/data/codecs/report-project-metadata';
import { AdminReadAdapter } from '../../../infrastructure/firebase/admin-read-adapter.js';
export type { ReportProjectMetadata } from '@work-track/data/codecs/report-project-metadata';

export function readProjectCatalog(
  db: Firestore,
  ids: string[],
): Promise<Map<string, ReportProjectMetadata>> {
  return new ProjectCatalogRepository(
    new AdminReadAdapter(db),
    'admin',
  ).readCatalog(ids);
}
export function selectReportRecords(
  records: ReportSourceRecord[],
  catalog: Map<string, ReportProjectMetadata>,
  scope: { viewerUid: string } | { companyOnly: true },
): ReportSourceRecord[] {
  return records.filter((record) => {
    if (isDeletedRecord(record)) return false;
    const project = catalog.get(record.projectId);
    return (
      project !== undefined &&
      ('companyOnly' in scope
        ? effectiveProjectType(project) === 'work'
        : canAccessProject(project, scope.viewerUid))
    );
  });
}
