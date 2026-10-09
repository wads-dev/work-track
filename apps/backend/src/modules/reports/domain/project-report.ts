export interface ProjectReportInput {
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
  projectId: string;
  asOf: string;
  policy: 'project-report-v1';
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
  records: ReportSourceRecord[];
  nextCursor: string | null;
  topicLabels: Record<string, string>;
}
export interface ProjectReportRepository {
  readPage(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<ReportPage | null>;
  userLabels(uids: string[]): Promise<Record<string, string>>;
}
