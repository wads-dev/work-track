import { resolveTimeMultiplier } from '@work-track/core/registration/domain/time-multipliers';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import type { Firestore } from 'firebase-admin/firestore';
import {
  nextReportCursor,
  orderReportQuery,
  reportUpperDatePrefix,
  resumeReportQuery,
} from './admin-report-query.js';
import type { ReportRecordSelection } from '@work-track/core/reports/domain/personal-report';
import { matchesReportSelection } from './project-catalog.js';
import { FirestoreCompanyReportRepository } from './firestore-company-report.js';
import { loadGlobalContext } from './firestore-global-context.js';
import type { Auth } from 'firebase-admin/auth';
import { reportRecordSchema } from '@work-track/data/codecs/report-record';
import { decodeReportProjectMetadata } from '@work-track/data/codecs/report-project-metadata';
import {
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import { readProjectCatalog, selectReportRecords } from './project-catalog.js';
import type {
  ProjectReportRepository,
  ReportPage,
} from '@work-track/core/reports/domain/project-report';
const recordSchema = reportRecordSchema('admin-project');
export class FirestoreProjectReportRepository implements ProjectReportRepository {
  constructor(
    private readonly db: Firestore,
    private readonly auth: Auth,
  ) {}
  async loadContext(uids: string[], personalOwnerUid?: string) {
    const records = await loadGlobalContext(
      this.db,
      uids,
      personalOwnerUid
        ? { viewerUid: personalOwnerUid }
        : { companyOnly: true },
    );
    const catalog = await readProjectCatalog(
      this.db,
      records.map((r) => r.projectId),
    );
    return selectReportRecords(
      records,
      catalog,
      personalOwnerUid
        ? { viewerUid: personalOwnerUid }
        : { companyOnly: true },
    );
  }
  async readPage(
    projectId: string,
    limit: number,
    cursor?: string,
    viewerUid?: string,
    selection?: ReportRecordSelection,
  ): Promise<ReportPage | null> {
    const project = await this.db.collection('projects').doc(projectId).get();
    if (
      !project.exists ||
      !viewerUid ||
      !canAccessProject(project.data(), viewerUid)
    )
      return null;
    const personal = effectiveProjectType(project.data()!) === 'personal';
    let query = this.db
      .collectionGroup('records')
      .where('projectId', '==', projectId)
      .where('deletedAt', '==', null);
    if (personal) query = query.where('uid', '==', viewerUid);
    else if (selection?.userIds?.length) {
      // Project pages use the same sharded corporate UID selector as calendar pages.
      const recordsPage = await new FirestoreCompanyReportRepository(
        this.db,
        this.auth,
      ).readPage(limit, cursor, projectId, selection);
      const metadata = decodeReportProjectMetadata(project.data()!, 'admin');
      return {
        ...recordsPage,
        personal,
        archived: Boolean(metadata.archived || metadata.mergedInto),
        topics: metadata.topics,
        topicLabels: Object.fromEntries(
          metadata.topics.map((topic) => [topic.id, topic.title]),
        ),
      };
    }
    const upper = reportUpperDatePrefix(selection);
    query = resumeReportQuery(
      orderReportQuery(query, upper),
      cursor,
      upper,
      (key) => this.db.doc(key),
    );
    const snapshot = await query.limit(limit + 1).get();
    const docs = snapshot.docs.slice(0, limit);
    // Owner/path checks below validate ACL and
    // canonical query results; personal UID is selected in the native query above.
    const records = docs
      .filter((doc) => !isDeletedRecord(doc.data()))
      .filter((doc) => !personal || doc.ref.path.split('/')[1] === viewerUid)
      .map((doc) => {
        const value = recordSchema.parse(doc.data());
        // Restrict the collection group to canonical records and trusted path UID.
        const segments = doc.ref.path.split('/');
        if (
          segments.length !== 4 ||
          segments[0] !== 'users' ||
          segments[2] !== 'records' ||
          segments[1] !== value.uid
        )
          throw new Error('Invalid record ownership');
        return { ...value, id: doc.id };
      });
    const metadata = decodeReportProjectMetadata(project.data()!, 'admin');
    const topics = metadata.topics;
    const selected = selection
      ? records.filter((record) =>
          matchesReportSelection(record, metadata, selection),
        )
      : records;
    const topicLabels = Object.fromEntries(
      topics.map((topic) => [topic.id, topic.title]),
    );
    return {
      records: (personal
        ? selected.filter((r) => r.uid === viewerUid)
        : selected
      ).map((record) => ({
        ...record,
        timeMultiplier: resolveTimeMultiplier(
          metadata.timeMultipliers?.[record.uid],
          record.startedAt,
        ),
      })),
      personal,
      archived: Boolean(project.data()?.archived || project.data()?.mergedInto),
      topicLabels,
      topics,
      nextCursor:
        snapshot.docs.length > limit
          ? nextReportCursor(docs.at(-1), upper, true)
          : null,
    };
  }
  async userLabels(uids: string[]): Promise<Record<string, string>> {
    const labels: Record<string, string> = {};
    for (let i = 0; i < uids.length; i += 100) {
      try {
        const result = await this.auth.getUsers(
          uids.slice(i, i + 100).map((uid) => ({ uid })),
        );
        for (const user of result.users)
          if (user.displayName) labels[user.uid] = user.displayName;
      } catch {
        /* Names are best effort; no email fallback or error details exposed. */
      }
    }
    return labels;
  }
}
