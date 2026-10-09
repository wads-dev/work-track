import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { isDeletedRecord } from '../../registration/domain/record-lifecycle.js';
import {
  removalInput,
  RemovalError,
  type RemovalInput,
  type RemovalRepository,
  type RemovalResult,
} from '../domain/removal.js';
function canonical(value: unknown): string {
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
const hash = (v: unknown) =>
  createHash('sha256').update(canonical(v)).digest('hex');
export class FirestoreRemovalRepository implements RemovalRepository {
  constructor(private readonly db: Firestore) {}
  async removeRecord(
    raw: RemovalInput,
    uid: string,
    now = Date.now(),
  ): Promise<RemovalResult> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
      throw new RemovalError('not-found', 'Registro não encontrado.');
    const input = removalInput.parse(raw),
      { confirmed, previewToken, ...intent } = input;
    const fingerprint = hash(intent),
      operationId = hash([uid, 'remove', input.requestId]);
    const user = this.db.collection('users').doc(uid),
      sourceRef = user.collection('records').doc(input.recordId),
      auditRef = user.collection('removalAudits').doc(operationId);
    return this.db.runTransaction(async (tx) => {
      const [prior, sourceDoc] = await Promise.all([
        tx.get(auditRef),
        tx.get(sourceRef),
      ]);
      if (!sourceDoc.exists || sourceDoc.data()!.uid !== uid)
        throw new RemovalError('not-found', 'Registro não encontrado.');
      const before = sourceDoc.data()!;
      if (prior.exists) {
        const saved = prior.data() as {
          fingerprint: string;
          result: RemovalResult;
        };
        if (saved.fingerprint !== fingerprint)
          throw new RemovalError(
            'failed-precondition',
            'requestId já usado para intenção diferente.',
          );
        if (!confirmed || previewToken !== saved.result.previewToken)
          throw new RemovalError(
            'failed-precondition',
            'Retry exige a mesma confirmação e prévia.',
          );
        if (canonical(before) !== canonical(saved.result.record))
          throw new RemovalError(
            'aborted',
            'Registro alterado após remoção; nenhuma alteração.',
          );
        return saved.result;
      }
      if (isDeletedRecord(before))
        throw new RemovalError(
          'failed-precondition',
          'Registro já removido; não é atividade ativa.',
        );
      const token = hash([
        uid,
        fingerprint,
        sourceDoc.updateTime?.toMillis(),
        sourceDoc.updateTime?.nanoseconds,
        before,
      ]);
      if (confirmed && previewToken !== token)
        throw new RemovalError(
          'aborted',
          'Prévia ausente ou desatualizada; obtenha nova prévia e confirmação humana.',
        );
      const deletedAt = new Date(now).toISOString();
      const after = {
        ...before,
        deletedAt,
        deletedBy: uid,
        deleteReason: input.reason,
        deleteOperationId: operationId,
        updatedAt: deletedAt,
        updatedBy: uid,
      };
      const result: RemovalResult = {
        confirmed,
        recordId: input.recordId,
        operationId,
        previewToken: token,
        record: confirmed ? after : before,
        warnings: [
          'Remoção lógica: exclui registro de todas as leituras funcionais, horas, próximo início e orçamento estimado; pode alterar estimativas de outros registros. Evidência e auditoria são mantidas. Não encerra registro aberto, não remove outros registros ligados e não implementa desfazer.',
        ],
      };
      if (
        Buffer.byteLength(canonical({ before, after, result }), 'utf8') > 700000
      )
        throw new RemovalError(
          'failed-precondition',
          'Registro e auditoria excedem tamanho seguro; nenhuma alteração.',
        );
      if (!confirmed) return result;
      tx.update(sourceRef, {
        deletedAt,
        deletedBy: uid,
        deleteReason: input.reason,
        deleteOperationId: operationId,
        updatedAt: deletedAt,
        updatedBy: uid,
      });
      tx.create(auditRef, {
        authorUid: uid,
        reason: input.reason,
        updatedAt: deletedAt,
        fingerprint,
        before,
        after,
        result,
      });
      tx.create(sourceRef.collection('audit').doc('remove_' + operationId), {
        authorUid: uid,
        reason: input.reason,
        updatedAt: deletedAt,
        action: 'soft-delete',
        before,
        after,
        deleteOperationId: operationId,
      });
      return result;
    });
  }
}
