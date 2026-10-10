import type { Firestore } from 'firebase-admin/firestore';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import type { Auth } from 'firebase-admin/auth';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { FirestoreProjectReportRepository } from './firestore-project-report.js';
import { readProjectCatalog, selectReportRecords } from './project-catalog.js';
export class FirestoreTopicReportRepository extends FirestoreProjectReportRepository {
  constructor(
    private readonly topicDb: Firestore,
    auth: Auth,
  ) {
    super(topicDb, auth);
  }
  async revalidate(
    records: ReportSourceRecord[],
    viewerUid: string,
    personal: boolean,
  ) {
    const catalog = await readProjectCatalog(
      this.topicDb,
      records.map((r) => r.projectId),
    );
    const current: ReportSourceRecord[] = [];
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100);
      const docs = await this.topicDb.getAll(
        ...batch.map((r) =>
          this.topicDb
            .collection('users')
            .doc(r.uid)
            .collection('records')
            .doc(r.id),
        ),
      );
      for (let j = 0; j < docs.length; j++) {
        const doc = docs[j]!,
          record = batch[j]!,
          data = doc.data();
        if (!data || isDeletedRecord(data)) continue;
        if (
          data.uid !== record.uid ||
          data.projectId !== record.projectId ||
          data.startedAt !== record.startedAt ||
          (data.endedAt ?? undefined) !== record.endedAt ||
          JSON.stringify(data.topics ?? []) !== JSON.stringify(record.topics)
        )
          continue;
        current.push(record);
      }
    }
    return selectReportRecords(
      personal ? current.filter((r) => r.uid === viewerUid) : current,
      catalog,
      personal ? { viewerUid } : { companyOnly: true },
    );
  }
}
