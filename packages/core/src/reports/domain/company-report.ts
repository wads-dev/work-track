import type { ReportSourceRecord } from './project-report.js';
import type {
  PersonalReport,
  PersonalReportInput,
  ReportRecordSelection,
} from './personal-report.js';
export interface CompanyReportInput extends PersonalReportInput {
  includeArchived?: boolean;
}
export interface CompanyReport extends Omit<
  PersonalReport,
  'policy' | 'intervals'
> {
  policy: 'company-v4';
  byUser: { uid: string; label: string; minutes: number }[];
  intervals: (PersonalReport['intervals'][number] & { uid: string })[];
}
export interface CompanyReportRepository {
  /** Optional complete native selection; current ACL revalidation remains separate. */
  readCompleteSelection?(
    selection?: ReportRecordSelection,
  ): Promise<import('./personal-report.js').PersonalReportPage>;
  readTopics(
    projectIds: string[],
  ): Promise<
    Record<string, { id: string; title: string; mergedIntoTopicId?: string }[]>
  >;
  readPage(
    limit: number,
    cursor?: string,
    projectId?: string,
    selection?: ReportRecordSelection,
  ): Promise<{
    records: ReportSourceRecord[];
    scannedCount: number;
    nextCursor: string | null;
  }>;
  loadContext(uids: string[]): Promise<ReportSourceRecord[]>;
  archivedProjectIds(ids: string[]): Promise<string[]>;
  userLabels(uids: string[]): Promise<Record<string, string>>;
}
