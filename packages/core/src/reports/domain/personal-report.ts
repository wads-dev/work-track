import type { ReportSourceRecord } from './project-report.js';
import type { TopicBreakdown } from './topic-breakdown.js';
/** Repository-owned display selection; never apply to loadContext's global estimate facts.
 * Omitted options preserve historical include-all reads; supplied options default to active projects.
 * Period selection is interval intersection, including spanning and open records.
 */
export interface ReportRecordSelection {
  projectId?: string;
  projectIds?: string[];
  userIds?: string[];
  includeArchived?: boolean;
  from?: string;
  to?: string;
  topicId?: string;
}
/** Validate selector shapes even for direct repository callers. No selector means all. */
export function selectedProjectIds(
  selection?: ReportRecordSelection,
  legacyProjectId?: string,
) {
  if (
    legacyProjectId &&
    selection?.projectId &&
    legacyProjectId !== selection.projectId
  )
    throw new Error('Conflicting project selectors.');
  const singular = legacyProjectId ?? selection?.projectId;
  if (singular !== undefined && selection?.projectIds !== undefined)
    throw new Error('Conflicting project selectors.');
  for (const ids of [selection?.projectIds, selection?.userIds]) {
    if (
      ids &&
      (ids.length > 100 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id)))
    )
      throw new Error('Invalid report selector; maximum100 unique IDs.');
  }
  return singular === undefined ? selection?.projectIds : [singular];
}
export interface PersonalReportInput {
  userIds?: string[];
  includeArchived?: boolean;
  from?: string;
  to?: string;
  projectId?: string;
  projectIds?: string[];
  timeZone: string;
  limit?: number;
  cursor?: string;
}
export interface PersonalReport extends Pick<
  TopicBreakdown,
  'byTopic' | 'unassignedMinutes'
> {
  scope?: 'all-selected';
  policy: 'personal-v4';
  budgetTimeZone: 'America/Sao_Paulo';
  asOf: string;
  from?: string;
  to?: string;
  projectId?: string;
  projectIds?: string[];
  timeZone: string;
  totalMinutes: number;
  estimatedCount: number;
  byProject: { projectId: string; minutes: number }[];
  intervals: {
    id: string;
    projectId: string;
    startedAt: string;
    endedAt?: string;
    effectiveStartedAt: string;
    effectiveEndedAt: string;
    estimated: boolean;
    minutes: number;
    loggedMinutes?: number;
    allocatedMinutes?: number;
    timeMultiplier?: number;
    accountingSegments?: import('./accounted-time.js').AccountingSegment[];
  }[];
  warnings: string[];
  page: {
    limit: number;
    scannedCount: number;
    excludedCount: number;
    nextCursor: string | null;
    partial: boolean;
  };
}
export interface PersonalReportPage {
  records: ReportSourceRecord[];
  scannedCount: number;
  nextCursor: string | null;
}
export interface PersonalReportRepository {
  /** Optional complete native selection, bounded to2000; never a partial page. */
  readCompleteSelection?(
    uid: string,
    selection?: ReportRecordSelection,
  ): Promise<PersonalReportPage>;
  readTopics(
    projectIds: string[],
    uid: string,
  ): Promise<
    Record<string, { id: string; title: string; mergedIntoTopicId?: string }[]>
  >;
  archivedProjectIds(projectIds: string[]): Promise<string[]>;
  loadContext(uids: string[]): Promise<ReportSourceRecord[]>;
  readPage(
    uid: string,
    limit: number,
    cursor?: string,
    selection?: ReportRecordSelection,
  ): Promise<PersonalReportPage>;
}
