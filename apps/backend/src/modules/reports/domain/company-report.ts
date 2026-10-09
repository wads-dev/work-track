import type { ReportSourceRecord } from './project-report.js';
import type { PersonalReport, PersonalReportInput } from './personal-report.js';
export interface CompanyReportInput extends PersonalReportInput {
  includeArchived?: boolean;
}
export interface CompanyReport extends Omit<
  PersonalReport,
  'policy' | 'intervals'
> {
  policy: 'company-v3';
  byUser: { uid: string; label: string; minutes: number }[];
  intervals: (PersonalReport['intervals'][number] & { uid: string })[];
}
export interface CompanyReportRepository {
  readTopics(
    projectIds: string[],
  ): Promise<
    Record<string, { id: string; title: string; mergedIntoTopicId?: string }[]>
  >;
  readPage(
    limit: number,
    cursor?: string,
    projectId?: string,
  ): Promise<{
    records: ReportSourceRecord[];
    scannedCount: number;
    nextCursor: string | null;
  }>;
  loadContext(uids: string[]): Promise<ReportSourceRecord[]>;
  archivedProjectIds(ids: string[]): Promise<string[]>;
  userLabels(uids: string[]): Promise<Record<string, string>>;
}
