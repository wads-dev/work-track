import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { loadGlobalContext } from './firestore-global-context.js';
import type { Auth } from 'firebase-admin/auth';
import { z } from 'zod';
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
  loadContext(uids: string[]) {
    return loadGlobalContext(this.db, uids);
  }
  async readPage(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<ReportPage | null> {
    const project = await this.db.collection('projects').doc(projectId).get();
    if (!project.exists) return null;
    let query = this.db
      .collectionGroup('records')
      .where('projectId', '==', projectId)
      .orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(this.db.doc(cursor));
    const snapshot = await query.limit(limit + 1).get();
    const docs = snapshot.docs.slice(0, limit);
    const records = docs.map((doc) => {
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
    const data = project.data() as
      { topics?: { id: string; title: string }[] } | undefined;
    const topicLabels = Object.fromEntries(
      (data?.topics ?? []).map((topic) => [topic.id, topic.title]),
    );
    return {
      records,
      topicLabels,
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
