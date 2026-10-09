import { isDeletedRecord } from '../../registration/domain/record-lifecycle.js';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { loadGlobalContext } from './firestore-global-context.js';
import type { Auth } from 'firebase-admin/auth';
import { z } from 'zod';
import {
  canAccessProject,
  effectiveProjectType,
} from '../../registration/domain/project-access.js';
import { readProjectCatalog, selectReportRecords } from './project-catalog.js';
import type {
  ProjectReportRepository,
  ReportPage,
} from '../domain/project-report.js';
const recordSchema = z.object({
  uid: z.string(),
  projectId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  timeZone: z.string(),
  topics: z
    .array(
      z.object({
        topicId: z.string(),
        percentage: z.number().optional(),
        durationMinutes: z.number().optional(),
      }),
    )
    .default([]),
});
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
      .orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(this.db.doc(cursor));
    const snapshot = await query.limit(limit + 1).get();
    const docs = snapshot.docs.slice(0, limit);
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
    const parsedTopics = z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          mergedIntoTopicId: z.string().optional(),
        }),
      )
      .safeParse(project.data()?.topics ?? []);
    const topics = parsedTopics.success ? parsedTopics.data : [];
    const topicLabels = Object.fromEntries(
      topics.map((topic) => [topic.id, topic.title]),
    );
    return {
      records: personal ? records.filter((r) => r.uid === viewerUid) : records,
      personal,
      archived: Boolean(project.data()?.archived || project.data()?.mergedInto),
      topicLabels,
      topics,
      nextCursor:
        snapshot.docs.length > limit ? (docs.at(-1)?.ref.path ?? null) : null,
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
