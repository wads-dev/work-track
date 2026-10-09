import { isDeletedRecord } from '../../registration/domain/record-lifecycle.js';
import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { assertProjectAccess } from '../../registration/domain/project-access.js';
import type { Project } from '../../registration/domain/work-model.js';
import {
  planSplit,
  splitInput,
  SplitError,
  type SplitInput,
  type SplitRepository,
  type SplitResult,
} from '../domain/split.js';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
const hash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export class FirestoreSplitRepository implements SplitRepository {
  constructor(private readonly db: Firestore) {}
  async splitRecord(
    raw: SplitInput,
    uid: string,
    now = Date.now(),
  ): Promise<SplitResult> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
      throw new SplitError('not-found', 'Registro não encontrado.');
    const input = splitInput.parse(raw);
    const { confirmed, previewToken, acknowledgeSharedDestination, ...intent } =
      input;
    const fingerprint = hash(intent),
      operationId = hash([uid, 'split', input.requestId]);
    const user = this.db.collection('users').doc(uid),
      records = user.collection('records');
    const sourceRef = records.doc(input.recordId),
      auditRef = user.collection('splitAudits').doc(operationId);
    return this.db.runTransaction(async (tx) => {
      const prior = await tx.get(auditRef);
      if (prior.exists) {
        const saved = prior.data() as {
          fingerprint: string;
          result: SplitResult;
          before: Record<string, unknown>;
        };
        if (saved.fingerprint !== fingerprint)
          throw new SplitError(
            'failed-precondition',
            'requestId já usado para intenção diferente.',
          );
        if (
          saved.result.requiresSharedAcknowledgment &&
          !acknowledgeSharedDestination
        )
          throw new SplitError(
            'failed-precondition',
            'Confirme explicitamente publicação do texto no projeto compartilhado.',
          );
        if (!confirmed || previewToken !== saved.result.previewToken)
          throw new SplitError(
            'failed-precondition',
            'Operação já confirmada; retry exige mesma confirmação e prévia.',
          );
        const current = await Promise.all(
          saved.result.parts.map((p) => tx.get(records.doc(p.recordId))),
        );
        const projects = await Promise.all(
          [
            ...new Set([
              ...saved.result.parts.map((p) => p.data.projectId as string),
              saved.before.projectId as string,
            ]),
          ].map((id) => tx.get(this.db.collection('projects').doc(id))),
        );
        projects.forEach((doc) => assertProjectAccess(doc.data(), uid));
        if (
          current.some(
            (doc, i) =>
              !doc.exists ||
              canonical(doc.data()) !== canonical(saved.result.parts[i]!.data),
          )
        )
          throw new SplitError(
            'aborted',
            'Fatos alterados após divisão; retry não modifica fatos.',
          );
        return saved.result;
      }
      const sourceDoc = await tx.get(sourceRef);
      if (!sourceDoc.exists || sourceDoc.data()!.uid !== uid)
        throw new SplitError('not-found', 'Registro não encontrado.');
      const source = sourceDoc.data()!;
      if (isDeletedRecord(source))
        throw new SplitError(
          'failed-precondition',
          'Registro removido; divisão não permitida.',
        );
      if (
        typeof source.projectId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(source.projectId)
      )
        throw new SplitError('not-found', 'Projeto não encontrado.');
      const [originDoc, destDoc] = await Promise.all([
        tx.get(this.db.collection('projects').doc(source.projectId)),
        tx.get(this.db.collection('projects').doc(input.destinationProjectId)),
      ]);
      const origin = originDoc.exists
        ? ({ ...originDoc.data(), id: originDoc.id } as Project)
        : undefined;
      const destination = destDoc.exists
        ? ({ ...destDoc.data(), id: destDoc.id } as Project)
        : undefined;
      const requiresSharedAcknowledgment =
        origin?.type === 'personal' &&
        (destination?.type === 'work' || destination?.type === undefined);
      if (
        confirmed &&
        requiresSharedAcknowledgment &&
        !acknowledgeSharedDestination
      )
        throw new SplitError(
          'failed-precondition',
          'Texto original e interpretação serão compartilhados; obtenha confirmação explícita com acknowledgeSharedDestination true.',
        );
      const planned = planSplit(source, origin, destination, input, uid, now);
      const token = hash([
        uid,
        fingerprint,
        sourceDoc.updateTime?.toMillis(),
        sourceDoc.updateTime?.nanoseconds,
        source,
        originDoc.updateTime?.toMillis(),
        originDoc.updateTime?.nanoseconds,
        origin,
        destDoc.updateTime?.toMillis(),
        destDoc.updateTime?.nanoseconds,
        destination,
      ]);
      if (confirmed && previewToken !== token)
        throw new SplitError(
          'aborted',
          'Prévia ausente ou desatualizada; solicite nova prévia e confirmação humana.',
        );
      const updatedAt = new Date(now).toISOString();
      const parts = planned.map((p, i) => {
        const recordId = i === 0 ? input.recordId : hash([operationId, p.role]);
        const data = {
          ...p.data,
          id: recordId,
          splitOperationId: operationId,
          splitSourceRecordId: input.recordId,
          splitRole: p.role,
          updatedAt,
          updatedBy: uid,
        } as Record<string, unknown>;
        if (i > 0) {
          data.splitSourceRequestId = source.requestId ?? null;
          data.splitSourceFingerprint = source.fingerprint ?? null;
          delete data.requestId;
          delete data.fingerprint;
        }
        return { ...p, recordId, data };
      });
      const result: SplitResult = {
        confirmed,
        requiresSharedAcknowledgment,
        warnings: requiresSharedAcknowledgment
          ? [
              'Texto original e interpretação completos serão visíveis no projeto corporativo; confirmação explícita de compartilhamento obrigatória.',
            ]
          : [],
        operationId,
        previewToken: token,
        totalMilliseconds: planned.reduce((sum, p) => sum + p.milliseconds, 0),
        parts,
      };
      if (
        Buffer.byteLength(canonical({ before: source, result }), 'utf8') >
        700000
      )
        throw new SplitError(
          'failed-precondition',
          'Registro e auditoria excedem tamanho seguro da divisão; nenhuma alteração.',
        );
      if (!confirmed) return result;
      const extra = await Promise.all(
        parts.slice(1).map((p) => tx.get(records.doc(p.recordId))),
      );
      if (extra.some((doc) => doc.exists))
        throw new SplitError(
          'aborted',
          'Colisão de identidade; nenhuma alteração.',
        );
      tx.set(sourceRef, parts[0]!.data);
      parts.slice(1).forEach((p) => tx.create(records.doc(p.recordId), p.data));
      tx.create(auditRef, {
        authorUid: uid,
        reason: input.reason,
        updatedAt,
        fingerprint,
        acknowledgeSharedDestination,
        before: source,
        result,
      });
      tx.create(sourceRef.collection('audit').doc(operationId), {
        authorUid: uid,
        reason: input.reason,
        updatedAt,
        before: source,
        after: parts[0]!.data,
        splitOperationId: operationId,
        resultingRecordIds: parts.map((p) => p.recordId),
      });
      return result;
    });
  }
}
