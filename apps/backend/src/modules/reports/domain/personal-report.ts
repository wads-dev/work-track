import type { ReportSourceRecord } from './project-report.js';
export interface PersonalReportInput {
  from: string;
  to: string;
  timeZone: string;
  limit?: number;
  cursor?: string;
}
export interface PersonalReport {
  policy: 'personal-v1';
  asOf: string;
  from: string;
  to: string;
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
  readPage(
    uid: string,
    limit: number,
    cursor?: string,
  ): Promise<PersonalReportPage>;
}
