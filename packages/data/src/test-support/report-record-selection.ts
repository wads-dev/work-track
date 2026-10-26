import type { ReportRecordSelection } from '@work-track/core/reports/domain/personal-report';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { ReportContextError } from '@work-track/core/reports/domain/global-estimates';
import { topicMetadataMap } from '@work-track/core/reports/domain/calendar-topics';
import { resolveTopic } from '@work-track/core/reports/domain/topic-breakdown';
import type { ReportProjectMetadata } from '../codecs/report-project-metadata.js';

/** TEST DOUBLE ONLY. Production repositories must execute supported predicates in the database. */
export function matchesReportRecordSelection(
  record: ReportSourceRecord,
  projects: ReadonlyMap<string, ReportProjectMetadata>,
  selection?: ReportRecordSelection,
): boolean {
  if (!selection) return true;
  if (selection.projectId && record.projectId !== selection.projectId)
    return false;
  if (selection.projectIds && !selection.projectIds.includes(record.projectId))
    return false;
  if (selection.userIds && !selection.userIds.includes(record.uid))
    return false;
  const project = projects.get(record.projectId);
  if (
    !selection.includeArchived &&
    (!project || project.archived || project.mergedInto)
  )
    return false;
  // Preserve spanning/open records and compare ISO offsets as instants, not lexically.
  const start = Date.parse(record.startedAt);
  const end =
    record.endedAt === undefined ? Infinity : Date.parse(record.endedAt);
  if (selection.from && end < Date.parse(selection.from)) return false;
  if (selection.to && start >= Date.parse(selection.to)) return false;
  if (selection.topicId) {
    const topics = topicMetadataMap(project?.topics ?? []);
    const wanted = resolveTopic(topics, selection.topicId);
    if ('error' in wanted)
      throw new ReportContextError('Identidade de tópico inválida.');
    if (
      !record.topics.some((topic) => {
        const resolved = resolveTopic(topics, topic.topicId);
        return !('error' in resolved) && resolved.topicId === wanted.topicId;
      })
    )
      return false;
  }
  return true;
}
