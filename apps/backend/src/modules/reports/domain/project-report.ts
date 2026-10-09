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
export interface ProjectReport {
  scope?: 'all-selected';
  projectId: string;
  asOf: string;
  policy: 'project-report-v3';
  budgetTimeZone: 'America/Sao_Paulo';
  totalMinutes: number;
  byUser: { uid: string; label: string; minutes: number }[];
  byTopic: { topicId: string; label: string; minutes: number }[];
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
  archived?: boolean;
  records: ReportSourceRecord[];
  nextCursor: string | null;
  topicLabels: Record<string, string>;
}
export interface ProjectReportRepository {
  loadContext(uids: string[]): Promise<ReportSourceRecord[]>;
  readPage(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<ReportPage | null>;
  userLabels(uids: string[]): Promise<Record<string, string>>;
}
