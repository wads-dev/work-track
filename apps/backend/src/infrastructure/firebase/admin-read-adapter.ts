import type { Firestore } from 'firebase-admin/firestore';
import type { DocumentReadPort } from '@work-track/data/ports/document-read-port';

/** Admin batching only. Existing report transactions remain at their SDK call sites. */
export class AdminReadAdapter implements DocumentReadPort {
  constructor(private readonly db: Firestore) {}

  async getMany(collectionPath: string, ids: readonly string[]) {
    if (!ids.length) return [];
    const documents = await this.db.getAll(
      ...ids.map((id) => this.db.collection(collectionPath).doc(id)),
    );
    return documents.map((document) => ({
      id: document.id,
      data: document.exists ? document.data() : undefined,
    }));
  }
}
