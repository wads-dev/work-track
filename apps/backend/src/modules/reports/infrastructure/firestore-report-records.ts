import type { Firestore } from 'firebase-admin/firestore';
import type {
  ReportRecord,
  ReportRecordsRepository,
} from '../domain/report-record.js';
export class FirestoreReportRecordsRepository implements ReportRecordsRepository {
  constructor(private readonly db: Firestore) {}
  async listByProject(
    projectId: string,
    limit: number,
  ): Promise<ReportRecord[]> {
    const snapshot = await this.db
      .collectionGroup('records')
      .where('projectId', '==', projectId)
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        projectId: data.projectId as string,
        uid: data.uid as string,
        startedAt: data.startedAt as string,
        ...(typeof data.endedAt === 'string' ? { endedAt: data.endedAt } : {}),
      };
    });
  }
}
