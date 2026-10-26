import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import type { Firestore } from 'firebase-admin/firestore';
import {
  compareReportDocuments,
  nextReportCursor,
  orderReportQuery,
  reportUpperDatePrefix,
  resumeReportQuery,
} from './admin-report-query.js';
import { decodeReportProjectMetadata } from '@work-track/data/codecs/report-project-metadata';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { loadGlobalContext } from './firestore-global-context.js';
import { reportRecordSchema } from '@work-track/data/codecs/report-record';
import { readProjectCatalog, selectReportRecords } from './project-catalog.js';
import type {
  PersonalReportRepository,
  ReportRecordSelection,
} from '@work-track/core/reports/domain/personal-report';
import { selectedProjectIds } from '@work-track/core/reports/domain/personal-report';
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
      for (const doc of docs) {
        if (!doc.exists) {
          archived.push(doc.id);
          continue;
        }
        const metadata = decodeReportProjectMetadata(doc.data()!, 'admin');
        if (metadata.archived || metadata.mergedInto) archived.push(doc.id);
      }
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
  async readPage(
    uid: string,
    limit: number,
    cursor?: string,
    selection?: ReportRecordSelection,
  ) {
    const projectIds = selectedProjectIds(selection);
    if (projectIds?.length === 0)
      return { records: [], scannedCount: 0, nextCursor: null };
    if (selection?.userIds && !selection.userIds.includes(uid))
      return { records: [], scannedCount: 0, nextCursor: null };
    const upper = reportUpperDatePrefix(selection);
    const query: FirebaseFirestore.Query = this.db
      .collection('users')
      .doc(uid)
      .collection('records')
      .where('deletedAt', '==', null);
    const shards: (string[] | undefined)[] = [];
    if (projectIds) {
      for (let i = 0; i < projectIds.length; i += 10)
        shards.push(projectIds.slice(i, i + 10));
    } else shards.push(undefined);
    const snapshots: FirebaseFirestore.QuerySnapshot[] = [];
    for (const projects of shards) {
      const filtered = projects
        ? query.where(
            'projectId',
            projects.length === 1 ? '==' : 'in',
            projects.length === 1 ? projects[0] : projects,
          )
        : query;
      snapshots.push(
        await resumeReportQuery(
          orderReportQuery(filtered, upper),
          cursor,
          upper,
        )
          .limit(limit + 1)
          .get(),
      );
    }
    const merged =
      snapshots.length === 1
        ? snapshots[0]!.docs
        : snapshots
            .flatMap((page) => page.docs)
            .sort((a, b) => compareReportDocuments(a, b, upper));
    const snapshot = { docs: merged },
      docs = merged.slice(0, limit);
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
      records: selectReportRecords(
        records,
        catalog,
        { viewerUid: uid },
        selection,
      ),
      scannedCount: records.filter((r) =>
        canAccessProject(catalog.get(r.projectId), uid),
      ).length,
      nextCursor:
        snapshot.docs.length > limit
          ? nextReportCursor(docs.at(-1), upper)
          : null,
    };
  }
}
