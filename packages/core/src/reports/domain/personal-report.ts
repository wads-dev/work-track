import type { ReportSourceRecord } from './project-report.js';
import type { TopicBreakdown } from './topic-breakdown.js';
/** Repository-owned display selection; never apply to loadContext's global estimate facts.
 * Omitted options preserve legacy include-all reads; supplied options default to active projects.
 * Period selection is interval intersection, including spanning and open records.
 */
export interface ReportRecordSelection {
  projectId?: string;
  userIds?: string[];
  includeArchived?: boolean;
  from?: string;
  to?: string;
  topicId?: string;
}
export interface PersonalReportInput {
  includeArchived?: boolean;
  from?: string;
  to?: string;
  projectId?: string;
  timeZone: string;
  limit?: number;
  cursor?: string;
}
export interface PersonalReport extends Pick<
  TopicBreakdown,
  'byTopic' | 'unassignedMinutes'
> {
  scope?: 'all-selected';
  policy: 'personal-v3';
  budgetTimeZone: 'America/Sao_Paulo';
  asOf: string;
  from?: string;
  to?: string;
  projectId?: string;
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
