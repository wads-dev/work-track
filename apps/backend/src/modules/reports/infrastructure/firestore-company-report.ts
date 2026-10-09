import { isDeletedRecord } from '../../registration/domain/record-lifecycle.js';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { z } from 'zod';
import {
  readProjectCatalog,
  reportTopicsSchema,
  selectReportRecords,
} from './project-catalog.js';
import { effectiveProjectType } from '../../registration/domain/project-access.js';
import type { CompanyReportRepository } from '../domain/company-report.js';
import { FirestorePersonalReportRepository } from './firestore-personal-report.js';
import { FirestoreProjectReportRepository } from './firestore-project-report.js';
import { loadGlobalContext } from './firestore-global-context.js';
const schema = z.object({
  uid: z.string(),
  projectId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  timeZone: z.string(),
  topics: reportTopicsSchema,
});
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
  async readPage(limit: number, cursor?: string, projectId?: string) {
    let query = this.db
      .collectionGroup('records')
      .orderBy(FieldPath.documentId());
    if (projectId) query = query.where('projectId', '==', projectId);
    if (cursor) query = query.startAfter(this.db.doc(cursor));
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
    const visible = selectReportRecords(records, catalog, {
      companyOnly: true,
    });
    return {
      records: visible,
      scannedCount: visible.length,
      nextCursor:
        snapshot.docs.length > limit ? (docs.at(-1)?.ref.path ?? null) : null,
    };
  }
}
