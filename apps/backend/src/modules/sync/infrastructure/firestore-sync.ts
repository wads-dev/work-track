import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import type {
  SyncEvent,
  SyncRow,
  SyncStore,
} from '../application/sync-workspace.js';
import { normalizeSyncData } from '../application/sync-workspace.js';

export const SYNC_PAGE_SIZE = 250;
export const SYNC_PROJECT_BUDGET = 1000;
export const SYNC_AUDIT_BUDGET = 1000;
export const SYNC_BOOTSTRAP_BYTE_BUDGET = 5 * 1024 * 1024;

/** Delivery ids are durable: deleting ledger entries would break retry idempotency. */
export async function appendSyncEvent(
  db: Firestore,
  eventId: string,
  path: string,
  previousProjectId?: string,
  scopeChanged = false,
): Promise<void> {
  const ledger = db.doc(
    'webSyncDeliveries/' + createHash('sha256').update(eventId).digest('hex'),
  );
  const canonical = db.doc(path);
  const head = db.doc('webSyncState/head');
  await db.runTransaction(async (tx) => {
    const delivery = await tx.get(ledger);
    if (delivery.exists) return;
    // Never use the trigger after snapshot: deliveries can arrive out of order.
    // Reading canonical in this transaction also detects concurrent canonical writes.
    const current = await tx.get(canonical);
    const audit = /^users[/][^/]+[/]records[/][^/]+[/]audit[/][^/]+$/.test(
      path,
    );
    const parent = audit
      ? await tx.get(db.doc(path.split('/').slice(0, 4).join('/')))
      : undefined;
    const project = /^projects[/][^/]+$/.test(path);
    const generationRef = project
      ? db.doc('webSyncProjectGenerations/' + canonical.id)
      : undefined;
    const generation = generationRef ? await tx.get(generationRef) : undefined;
    const state = await tx.get(head);
    const oldRevision =
      (state.data() as { revision?: number } | undefined)?.revision ?? 0;
    if (
      !Number.isSafeInteger(oldRevision) ||
      oldRevision < 0 ||
      oldRevision >= Number.MAX_SAFE_INTEGER
    )
      throw new Error('Invalid or exhausted sync revision.');
    const revision = oldRevision + 1;
    const data =
      current.exists &&
      (!audit || (parent?.exists && !isDeletedRecord(parent.data())))
        ? (current.data() as Record<string, unknown>)
        : null;
    const projectData = audit ? parent?.data() : data;
    const projectId = path.startsWith('projects/')
      ? canonical.id
      : typeof projectData?.projectId === 'string'
        ? projectData.projectId
        : null;
    if (generationRef) {
      const prior = generation?.data() as
        { scope?: string; epoch?: number } | undefined;
      const scope = JSON.stringify([
        current.exists,
        current.data()?.type ?? null,
        current.data()?.createdBy ?? null,
      ]);
      const epoch = prior?.epoch ?? 0;
      if (
        !Number.isSafeInteger(epoch) ||
        epoch < 0 ||
        epoch >= Number.MAX_SAFE_INTEGER
      )
        throw new Error('Invalid or exhausted project ACL epoch.');
      // Before/after scope changes increment even when a late trigger observes
      // the same canonical scope (offline revoke/regrant). Ledger deduplicates.
      // Late distinct transitions harmlessly over-invalidate, never roll back.
      // Unobserved transitions remain uncertified until trigger backlog drains.
      tx.set(generationRef, {
        scope,
        epoch:
          epoch + (scopeChanged || (prior && prior.scope !== scope) ? 1 : 0),
      });
    }
    tx.create(db.doc('webSyncEvents/' + String(revision).padStart(16, '0')), {
      revision,
      path,
      projectId,
      data,
      ...(previousProjectId ? { previousProjectId } : {}),
    });
    tx.set(head, { revision });
    tx.create(ledger, { revision });
  });
}

export class FirestoreSyncStore implements SyncStore {
  constructor(private readonly db: Firestore) {}
  async head(): Promise<number> {
    const data = (await this.db.doc('webSyncState/head').get()).data() as
      { revision?: number } | undefined;
    return data?.revision ?? 0;
  }
  async projects(): Promise<SyncRow[]> {
    const snapshot = await this.db
      .collection('projects')
      .limit(SYNC_PROJECT_BUDGET + 1)
      .get();
    if (snapshot.docs.length > SYNC_PROJECT_BUDGET)
      throw new HttpsError('resource-exhausted', 'Catálogo excede orçamento.');
    const generations = snapshot.docs.length
      ? await this.db.getAll(
          ...snapshot.docs.map((doc) =>
            this.db.doc('webSyncProjectGenerations/' + doc.id),
          ),
        )
      : [];
    return snapshot.docs.map((doc, index) => ({
      path: doc.ref.path,
      data: doc.data(),
      generation:
        doc.createTime.toDate().toISOString() +
        ':' +
        String(generations[index]?.data()?.epoch ?? 0),
    }));
  }
  async events(cursor: number, head: number): Promise<SyncEvent[]> {
    const snapshot = await this.db
      .collection('webSyncEvents')
      .where('revision', '>', cursor)
      .where('revision', '<=', head)
      .orderBy('revision')
      .limit(SYNC_PAGE_SIZE)
      .get();
    return snapshot.docs.map((doc) => doc.data() as SyncEvent);
  }
  async currentRows(paths: string[]): Promise<SyncRow[]> {
    if (!paths.length) return [];
    const docs = await this.db.getAll(
      ...[...new Set(paths)].map((path) => this.db.doc(path)),
    );
    return docs
      .filter((doc) => doc.exists)
      .map((doc) => ({ path: doc.ref.path, data: doc.data()! }));
  }
  async bootstrap(
    projectId: string,
    after: string | undefined,
    uid: string,
  ): Promise<SyncRow[]> {
    let query = this.db
      .collectionGroup('records')
      .where('projectId', '==', projectId)
      .orderBy(FieldPath.documentId())
      .limit(SYNC_PAGE_SIZE);
    if (after) query = query.startAfter(this.db.doc(after));
    const snapshot = await query.get();
    const rows: SyncRow[] = snapshot.docs.map((doc) => ({
      path: doc.ref.path,
      data: doc.data(),
    }));
    let auditCount = 0;
    let bytes = Buffer.byteLength(
      JSON.stringify(normalizeSyncData(rows)),
      'utf8',
    );
    const checkBytes = () => {
      if (bytes >= SYNC_BOOTSTRAP_BYTE_BUDGET)
        throw new HttpsError(
          'resource-exhausted',
          'Bootstrap excede orçamento de bytes.',
        );
    };
    checkBytes();
    // Only own active parents: shared project access never grants another user's audit.
    for (const record of snapshot.docs) {
      if (
        record.ref.path.split('/')[1] !== uid ||
        isDeletedRecord(record.data())
      )
        continue;
      const audits = await record.ref
        .collection('audit')
        .orderBy(FieldPath.documentId())
        .limit(SYNC_AUDIT_BUDGET - auditCount + 1)
        .get();
      auditCount += audits.size;
      if (auditCount > SYNC_AUDIT_BUDGET)
        throw new HttpsError(
          'resource-exhausted',
          'Histórico excede orçamento; resultado não é parcial.',
        );
      const auditRows = audits.docs.map((doc) => ({
        path: doc.ref.path,
        data: doc.data(),
      }));
      bytes += Buffer.byteLength(
        JSON.stringify(normalizeSyncData(auditRows)),
        'utf8',
      );
      checkBytes();
      rows.push(...auditRows);
    }
    return rows;
  }
}
