import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { loadGlobalContext } from './firestore-global-context.js';
import { z } from 'zod';
import type { PersonalReportRepository } from '../domain/personal-report.js';
const source = z.object({
  projectId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  timeZone: z.string(),
});
export class FirestorePersonalReportRepository implements PersonalReportRepository {
  constructor(private readonly db: Firestore) {}
  loadContext(uids: string[]) {
    return loadGlobalContext(this.db, uids);
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
    const records = docs.map((doc) => ({
      ...source.parse(doc.data()),
      id: doc.id,
      uid,
      topics: [],
    }));
    return {
      records,
      scannedCount: docs.length,
      nextCursor:
        snapshot.docs.length > limit ? (docs.at(-1)?.id ?? null) : null,
    };
  }
}
