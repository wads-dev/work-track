import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { CalendarRepository } from '../presentation/get-calendar-report.js';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { FirestorePersonalReportRepository } from './firestore-personal-report.js';
import { FirestoreCompanyReportRepository } from './firestore-company-report.js';
import { readProjectCatalog, selectReportRecords } from './project-catalog.js';
export class FirestoreCalendarReportRepository implements CalendarRepository {
  readonly own;
  readonly company;
  constructor(
    private readonly db: Firestore,
    auth: Auth,
  ) {
    this.own = new FirestorePersonalReportRepository(db);
    this.company = new FirestoreCompanyReportRepository(db, auth);
  }
  async revalidate(
    records: ReportSourceRecord[],
    viewerUid: string,
    mode: 'own' | 'global',
  ) {
    const catalog = await readProjectCatalog(
      this.db,
      records.map((r) => r.projectId),
    );
    return selectReportRecords(
      mode === 'own' ? records.filter((r) => r.uid === viewerUid) : records,
      catalog,
      mode === 'own' ? { viewerUid } : { companyOnly: true },
    );
  }
}
