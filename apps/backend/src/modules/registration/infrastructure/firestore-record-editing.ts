import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { assertProjectWritable } from '../domain/project-management.js';
import {
  applyRecordPatch,
  recordSummary,
  RecordEditError,
  type RecordEditingRepository,
  type UpdateRecordInput,
} from '../domain/record-edit.js';
export class FirestoreRecordEditingRepository implements RecordEditingRepository {
  constructor(private readonly db: Firestore) {}
  async updateRecord(input: UpdateRecordInput, uid: string) {
    const ref = this.db
      .collection('users')
      .doc(uid)
      .collection('records')
      .doc(input.recordId);
    const audit = input.requestId
      ? ref.collection('audit').doc(input.requestId)
      : ref.collection('audit').doc();
    const updatedAt = new Date().toISOString();
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists)
        throw new RecordEditError('not-found', 'Registro não encontrado.');
      const before = snapshot.data() as Record<string, unknown>;
      if (before.uid !== uid)
        throw new RecordEditError(
          'permission-denied',
          'Somente o dono pode editar o registro.',
        );
      const priorAudit = await tx.get(audit);
      if (priorAudit.exists) {
        const prior = priorAudit.data() as {
          request: string;
          updatedAt: string;
          after: ReturnType<typeof recordSummary>;
        };
        if (prior.request !== JSON.stringify(input))
          throw new RecordEditError(
            'invalid-argument',
            'requestId já usado para outra alteração.',
          );
        return {
          recordId: input.recordId,
          updatedAt: prior.updatedAt,
          auditId: audit.id,
          record: prior.after,
        };
      }
      const projectId = input.projectId ?? (before.projectId as string);
      const projectRef = this.db.collection('projects').doc(projectId);
      const projectSnapshot = await tx.get(projectRef);
      if (!projectSnapshot.exists)
        throw new RecordEditError('invalid-argument', 'Projeto não existe.');
      const project = projectSnapshot.data() as {
        title: string;
        description: string;
        topics: { id: string; title: string; description: string }[];
      };
      assertProjectWritable(
        projectSnapshot.data() as { mergeLock?: string; archived?: boolean },
      );
      if (input.projectId && input.projectId !== before.projectId) {
        const original = await tx.get(
          this.db.collection('projects').doc(before.projectId as string),
        );
        if (!original.exists)
          throw new RecordEditError(
            'invalid-argument',
            'Projeto original não existe.',
          );
        assertProjectWritable(
          original.data() as { mergeLock?: string; archived?: boolean },
        );
      }
      const after = applyRecordPatch(before, input, uid, project);
      const summary = recordSummary(after, input.recordId);
      const patch: Record<string, unknown> = { updatedAt, updatedBy: uid };
      if (input.endedAt !== undefined)
        patch.endedAt =
          input.endedAt === null ? FieldValue.delete() : input.endedAt;
      if (input.projectId !== undefined) {
        patch.projectId = input.projectId;
        patch.projectSnapshot = {
          title: project.title,
          description: project.description,
        };
      }
      if (input.topics !== undefined || input.projectId !== undefined) {
        patch.topics = summary.topics;
        patch.topicSnapshots = summary.topics.map((topic) =>
          project.topics.find((known) => known.id === topic.topicId),
        );
      }
      tx.update(ref, patch);
      tx.create(audit, {
        request: JSON.stringify(input),
        authorUid: uid,
        updatedAt,
        recordedAt: FieldValue.serverTimestamp(),
        reason: input.reason,
        before: recordSummary(before, input.recordId),
        after: summary,
      });
      return {
        recordId: input.recordId,
        auditId: audit.id,
        updatedAt,
        record: summary,
      };
    });
  }
  async listOpenRecords(uid: string, limit: number) {
    // Legacy open records omit endedAt: Firestore equality-to-null cannot match
    // missing fields. Bound the scan explicitly, report partial instead of lying.
    const snapshot = await this.db
      .collection('users')
      .doc(uid)
      .collection('records')
      .limit(501)
      .get();
    const open = snapshot.docs
      .filter((doc) => doc.data().endedAt === undefined)
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          projectId: data.projectId as string,
          startedAt: data.startedAt as string,
        };
      });
    return {
      records: open.slice(0, limit),
      partial: snapshot.docs.length > 500 || open.length > limit,
    };
  }
}
