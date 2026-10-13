import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import type { Firestore } from 'firebase-admin/firestore';
import {
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import type { ReportRecordSelection } from '@work-track/core/reports/domain/personal-report';
import { CalendarReportError } from '@work-track/core/reports/application/get-calendar-report';
import { resolveTopic } from '@work-track/core/reports/domain/topic-breakdown';
import { topicMetadataMap } from '@work-track/core/reports/domain/calendar-topics';
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
/** Firebase residuals: archive/type are joined project metadata; type must be explicit;
 * tombstones can be absent or null. ISO-offset strings do not sort chronologically, so
 * a startedAt/endedAt lexical range would omit valid spanning records. Array-of-object
 * topic allocations and alias chains cannot be queried by a nested array member ID.
 * Project/UID/docId predicates are pushed into native queries before this residual.
 */
export function matchesReportSelection(
  record: ReportSourceRecord,
  project: ReportProjectMetadata,
  selection?: ReportRecordSelection,
) {
  if (!selection) return true;
  if (!selection.includeArchived && (project.archived || project.mergedInto))
    return false;
  // UID/project checks here only validate query output; the native query selects both.
  if (selection.projectId && record.projectId !== selection.projectId)
    return false;
  if (selection.userIds && !selection.userIds.includes(record.uid))
    return false;
  const start = Date.parse(record.startedAt);
  const end =
    record.endedAt === undefined ? Infinity : Date.parse(record.endedAt);
  // Invalid dates belong to schema/domain validation, not a silent dataset omission.
  if (Number.isFinite(start) && (end === Infinity || Number.isFinite(end))) {
    if (selection.to && start >= Date.parse(selection.to)) return false;
    if (selection.from && end < Date.parse(selection.from)) return false;
  }
  if (selection.topicId) {
    const metadata = topicMetadataMap(project.topics);
    const target = resolveTopic(metadata, selection.topicId);
    if ('error' in target)
      throw new CalendarReportError(
        'failed-precondition',
        'Tópico não possui identidade canônica segura.',
      );
    return record.topics.some((topic) => {
      const resolved = resolveTopic(metadata, topic.topicId);
      return !('error' in resolved) && resolved.topicId === target.topicId;
    });
  }
  return true;
}
export function selectReportRecords(
  records: ReportSourceRecord[],
  catalog: Map<string, ReportProjectMetadata>,
  scope: { viewerUid: string } | { companyOnly: true },
  selection?: ReportRecordSelection,
): ReportSourceRecord[] {
  return records.filter((record) => {
    if (isDeletedRecord(record)) return false;
    const project = catalog.get(record.projectId);
    if (
      !project ||
      !('companyOnly' in scope
        ? effectiveProjectType(project) === 'work'
        : canAccessProject(project, scope.viewerUid))
    )
      return false;
    return matchesReportSelection(record, project, selection);
  });
}
