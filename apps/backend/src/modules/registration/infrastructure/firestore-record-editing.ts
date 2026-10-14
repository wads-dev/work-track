import { buildRecordEditPlan } from '@work-track/data/repositories/record-edit-plan';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import {
  FieldPath,
  FieldValue,
  type Firestore,
} from 'firebase-admin/firestore';
import { assertProjectWritable } from '@work-track/core/registration/domain/project-management';
import {
  assertProjectAccess,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import {
  recordSummary,
  RecordEditError,
  type RecordEditingRepository,
  type UpdateRecordInput,
} from '@work-track/core/registration/domain/record-edit';
export class FirestoreRecordEditingRepository implements RecordEditingRepository {
  constructor(private readonly db: Firestore) {}
  async updateRecord(input: UpdateRecordInput, uid: string) {
    const ref = this.db
      .collection('users')
      .doc(input.recordOwnerUid ?? uid)
      .collection('records')
      .doc(input.recordId);
    const audit = input.requestId
      ? ref.collection('audit').doc(input.requestId)
      : ref.collection('audit').doc();
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists)
        throw new RecordEditError('not-found', 'Registro não encontrado.');
      const before = snapshot.data() as Record<string, unknown>;
      if (isDeletedRecord(before))
        throw new RecordEditError(
          'not-found',
          'Registro removido; edição não permitida.',
        );
      if (before.uid !== (input.recordOwnerUid ?? uid))
        throw new RecordEditError('not-found', 'Registro não encontrado.');
      const origin = await tx.get(
        this.db.collection('projects').doc(before.projectId as string),
      );
      assertProjectAccess(origin.data(), uid);
      const corporateEdit = before.uid !== uid;
      if (corporateEdit && effectiveProjectType(origin.data()!) !== 'work')
        throw new RecordEditError('not-found', 'Registro não encontrado.');
      if (input.projectId !== undefined) {
        const destination = await tx.get(
          this.db.collection('projects').doc(input.projectId),
        );
        assertProjectAccess(destination.data(), uid);
        if (
          corporateEdit &&
          effectiveProjectType(destination.data()!) !== 'work'
        )
          throw new RecordEditError(
            'permission-denied',
            'Registro de outro participante deve permanecer em projeto corporativo.',
          );
        if (
          effectiveProjectType(origin.data()!) === 'personal' &&
          effectiveProjectType(destination.data()!) === 'work' &&
          !input.acknowledgeSharedDestination
        )
          throw new RecordEditError(
            'invalid-argument',
            'A transferência publica o texto na organização; confirme acknowledgeSharedDestination explicitamente.',
          );
      }
      const priorAudit = await tx.get(audit);
      if (priorAudit.exists) {
        const prior = priorAudit.data() as {
          request: string;
          authorUid: string;
          updatedAt: string;
          after: ReturnType<typeof recordSummary>;
          result?: ReturnType<typeof recordSummary>;
        };
        if (prior.authorUid !== uid || prior.request !== JSON.stringify(input))
          throw new RecordEditError(
            'invalid-argument',
            'requestId já usado para outra alteração.',
          );
        return {
          recordId: input.recordId,
          updatedAt: prior.updatedAt,
          auditId: audit.id,
          record: prior.result ?? prior.after,
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
        topics: {
          id: string;
          title: string;
          description: string;
          archived: boolean;
        }[];
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
      const updatedAt = new Date().toISOString();
      const {
        patch,
        summary,
        audit: auditData,
      } = buildRecordEditPlan(
        before,
        input,
        uid,
        project,
        updatedAt,
        corporateEdit,
      );
      tx.update(ref, patch);
      tx.create(audit, {
        ...auditData,
        recordedAt: FieldValue.serverTimestamp(),
      });
      return {
        recordId: input.recordId,
        auditId: audit.id,
        updatedAt,
        record: summary,
      };
    });
  }
  async listOpenRecords(uid: string, limit: number, excludeRecordId?: string) {
    // Select canonical active opens natively before applying result limits.
    let query: FirebaseFirestore.Query = this.db
      .collection('users')
      .doc(uid)
      .collection('records')
      .where('uid', '==', uid)
      .where('endedAt', '==', null)
      .where('deletedAt', '==', null);
    if (excludeRecordId)
      query = query.where(FieldPath.documentId(), '!=', excludeRecordId);
    const snapshot = await query.limit(10001).get();
    if (snapshot.docs.length > 10000)
      throw new Error(
        'Varredura de abertos excede 10000 documentos físicos; consulta indisponível, não presuma ausência de tracking.',
      );
    const open = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        projectId: data.projectId as string,
        startedAt: data.startedAt as string,
      };
    });
    return {
      records: open.slice(0, limit),
      partial: open.length > limit,
    };
  }
}
