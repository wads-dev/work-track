import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { loadGlobalContext } from './firestore-global-context.js';
import { reportRecordSchema } from '@work-track/data/codecs/report-record';
import { readProjectCatalog, selectReportRecords } from './project-catalog.js';
import type { PersonalReportRepository } from '@work-track/core/reports/domain/personal-report';
const source = reportRecordSchema('admin-owned');
export class FirestorePersonalReportRepository implements PersonalReportRepository {
  constructor(private readonly db: Firestore) {}
  async archivedProjectIds(projectIds: string[]) {
    const archived: string[] = [];
    for (let i = 0; i < projectIds.length; i += 100) {
      const docs = await this.db.getAll(
        ...projectIds
          .slice(i, i + 100)
          .map((id) => this.db.collection('projects').doc(id)),
      );
      for (const doc of docs)
        if (!doc.exists || doc.data()?.archived || doc.data()?.mergedInto)
          archived.push(doc.id);
    }
    return archived;
  }
  async loadContext(uids: string[]) {
    if (uids.length !== 1)
      throw new Error('Personal report requires one owner.');
    const records = await loadGlobalContext(this.db, uids, {
      viewerUid: uids[0]!,
    });
    const catalog = await readProjectCatalog(
      this.db,
      records.map((r) => r.projectId),
    );
    return selectReportRecords(records, catalog, { viewerUid: uids[0]! });
  }
  async readTopics(projectIds: string[], uid: string) {
    const catalog = await readProjectCatalog(this.db, projectIds);
    return Object.fromEntries(
      [...catalog]
        .filter(([, p]) => canAccessProject(p, uid))
        .map(([id, p]) => [id, p.topics]),
    );
  }
  async readPage(uid: string, limit: number, cursor?: string) {
    let query = this.db
      .collection('users')
      .doc(uid)
      .collection('records')
      .orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.limit(limit + 1).get(),
      docs = snapshot.docs.slice(0, limit);
    const catalog = await readProjectCatalog(
      this.db,
      docs.flatMap((doc) =>
        typeof doc.data().projectId === 'string'
          ? [doc.data().projectId as string]
          : [],
      ),
    );
    const records = docs
      .filter((doc) => !isDeletedRecord(doc.data()))
      .filter((doc) =>
        canAccessProject(catalog.get(doc.data().projectId as string), uid),
      )
      .map((doc) => ({
        ...source.parse(doc.data()),
        id: doc.id,
        uid,
      }));
    return {
      records: selectReportRecords(records, catalog, { viewerUid: uid }),
      scannedCount: records.filter((r) =>
        canAccessProject(catalog.get(r.projectId), uid),
      ).length,
      nextCursor:
        snapshot.docs.length > limit ? (docs.at(-1)?.id ?? null) : null,
    };
  }
}
