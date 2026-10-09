export interface ProjectReportInput {
  includeArchived?: boolean;
  projectId: string;
  limit?: number;
  cursor?: string;
}
export interface ReportSourceRecord {
  id: string;
  uid: string;
  projectId: string;
  startedAt: string;
  endedAt?: string;
  timeZone: string;
  topics: { topicId: string; percentage?: number; durationMinutes?: number }[];
}
export interface ProjectReport extends Pick<
  import('./topic-breakdown.js').TopicBreakdown,
  'byTopic' | 'unassignedMinutes'
> {
  scope?: 'all-selected';
  projectId: string;
  asOf: string;
  policy: 'project-report-v3';
  budgetTimeZone: 'America/Sao_Paulo';
  totalMinutes: number;
  byUser: { uid: string; label: string; minutes: number }[];
  records: {
    id: string;
    uid: string;
    projectId: string;
    startedAt: string;
    endedAt?: string;
    effectiveEndedAt: string;
    estimated: boolean;
    minutes: number;
    topics: { topicId: string; minutes: number }[];
  }[];
  estimatedCount: number;
  warnings: string[];
  page: { limit: number; nextCursor: string | null; partial: boolean };
}
export interface ReportPage {
  personal?: boolean;
  archived?: boolean;
  records: ReportSourceRecord[];
  nextCursor: string | null;
  topicLabels: Record<string, string>;
  topics?: { id: string; title: string; mergedIntoTopicId?: string }[];
}
export interface ProjectReportRepository {
  loadContext(
    uids: string[],
    personalOwnerUid?: string,
  ): Promise<ReportSourceRecord[]>;
  readPage(
    projectId: string,
    limit: number,
    cursor?: string,
    viewerUid?: string,
  ): Promise<ReportPage | null>;
  userLabels(uids: string[]): Promise<Record<string, string>>;
}
