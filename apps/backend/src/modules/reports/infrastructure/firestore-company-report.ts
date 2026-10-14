import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import type { Firestore } from 'firebase-admin/firestore';
import {
  compareReportDocuments,
  nextReportCursor,
  orderReportQuery,
  reportUpperDatePrefix,
  resumeReportQuery,
} from './admin-report-query.js';
import type { Auth } from 'firebase-admin/auth';
import { reportRecordSchema } from '@work-track/data/codecs/report-record';
import { readProjectCatalog, selectReportRecords } from './project-catalog.js';
import { effectiveProjectType } from '@work-track/core/registration/domain/project-access';
import type { ReportRecordSelection } from '@work-track/core/reports/domain/personal-report';
import type { CompanyReportRepository } from '@work-track/core/reports/domain/company-report';
import { FirestorePersonalReportRepository } from './firestore-personal-report.js';
import { FirestoreProjectReportRepository } from './firestore-project-report.js';
import { loadGlobalContext } from './firestore-global-context.js';
const schema = reportRecordSchema('admin-company');
export class FirestoreCompanyReportRepository implements CompanyReportRepository {
  constructor(
    private readonly db: Firestore,
    private readonly auth: Auth,
  ) {}
  async loadContext(uids: string[]) {
    const records = await loadGlobalContext(this.db, uids, {
      companyOnly: true,
    });
    const catalog = await readProjectCatalog(
      this.db,
      records.map((r) => r.projectId),
    );
    return selectReportRecords(records, catalog, { companyOnly: true });
  }
  async readTopics(projectIds: string[]) {
    const catalog = await readProjectCatalog(this.db, projectIds);
    return Object.fromEntries(
      [...catalog]
        .filter(([, p]) => effectiveProjectType(p) === 'work')
        .map(([id, p]) => [id, p.topics]),
    );
  }
  archivedProjectIds(ids: string[]) {
    return new FirestorePersonalReportRepository(this.db).archivedProjectIds(
      ids,
    );
  }
  userLabels(uids: string[]) {
    return new FirestoreProjectReportRepository(this.db, this.auth).userLabels(
      uids,
    );
  }
  async readPage(
    limit: number,
    cursor?: string,
    projectId?: string,
    selection?: ReportRecordSelection,
  ) {
    projectId ??= selection?.projectId;
    if (selection?.userIds?.length === 0)
      return { records: [], scannedCount: 0, nextCursor: null };
    const upper = reportUpperDatePrefix(selection);
    let query: FirebaseFirestore.Query = this.db
      .collectionGroup('records')
      .where('deletedAt', '==', null);
    if (projectId) query = query.where('projectId', '==', projectId);
    const readQueryPage = (filtered: FirebaseFirestore.Query) =>
      resumeReportQuery(
        orderReportQuery(filtered, upper),
        cursor,
        upper,
        (key) => this.db.doc(key),
      )
        .limit(limit + 1)
        .get();
    // Firestore caps an in predicate at30 disjunctions. Merge independently
    // bounded UID shards in the native query order before the physical page
    // limit; never drop the remaining people or apply a UID array filter.
    const uids = [...new Set(selection?.userIds ?? [])];
    const snapshots: FirebaseFirestore.QuerySnapshot[] = [];
    if (!uids.length) snapshots.push(await readQueryPage(query));
    else
      for (let i = 0; i < uids.length; i += 30) {
        const shard = uids.slice(i, i + 30);
        snapshots.push(
          await readQueryPage(
            query.where(
              'uid',
              shard.length === 1 ? '==' : 'in',
              shard.length === 1 ? shard[0] : shard,
            ),
          ),
        );
      }
    const merged = [
      ...new Map(
        snapshots
          .flatMap((page) => page.docs)
          .map((doc) => [doc.ref.path, doc]),
      ).values(),
    ].sort((a, b) => compareReportDocuments(a, b, upper));
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
      .filter((doc) => {
        const project = catalog.get(doc.data().projectId as string);
        return project && effectiveProjectType(project) === 'work';
      })
      .map((doc) => {
        const data = schema.parse(doc.data()),
          parts = doc.ref.path.split('/');
        if (
          parts.length !== 4 ||
          parts[0] !== 'users' ||
          parts[2] !== 'records' ||
          parts[1] !== data.uid
        )
          throw new Error('Invalid canonical record');
        return { ...data, uid: parts[1], id: doc.id };
      });
    const visible = selectReportRecords(
      records,
      catalog,
      {
        companyOnly: true,
      },
      selection,
    );
    return {
      records: visible,
      scannedCount: visible.length,
      nextCursor:
        snapshot.docs.length > limit
          ? nextReportCursor(docs.at(-1), upper, true)
          : null,
    };
  }
}
