import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  ProjectManagementError,
  assertProjectWritable,
} from '../domain/project-management.js';
import { effectiveProjectType } from '../domain/project-access.js';
import {
  projectScopeInput,
  type ProjectScopeInput,
  type ProjectScopeRepository,
  type ScopeExecution,
} from '../domain/project-scope.js';
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => JSON.stringify(k) + ':' + canonical(x))
        .join(',') +
      '}'
    );
  return JSON.stringify(v) ?? 'null';
}
const hash = (v: unknown) =>
  createHash('sha256').update(canonical(v)).digest('hex');
export class FirestoreProjectScopeRepository implements ProjectScopeRepository {
  constructor(private readonly db: Firestore) {}
  async changeScope(raw: ProjectScopeInput, uid: string) {
    const input = projectScopeInput.parse(raw);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
      throw new ProjectManagementError(
        'permission-denied',
        'Usuário inválido.',
      );
    const { confirmed, previewToken, acknowledgeSharedDestination, ...intent } =
      input;
    const fingerprint = hash(intent),
      operationId = hash([uid, 'scope', input.requestId]);
    const ref = this.db.collection('projects').doc(input.projectId),
      audit = ref.collection('audit').doc('scope_' + operationId);
    return this.db.runTransaction(async (tx) => {
      const [snapshot, prior] = await Promise.all([tx.get(ref), tx.get(audit)]);
      if (!snapshot.exists)
        throw new ProjectManagementError(
          'not-found',
          'Projeto não encontrado.',
        );
      const before = snapshot.data()!;
      if (typeof before.createdBy !== 'string' || before.createdBy !== uid)
        throw new ProjectManagementError(
          'permission-denied',
          'Somente o criador identificado pode alterar o escopo.',
        );
      if (prior.exists) {
        const p = prior.data() as {
          fingerprint: string;
          previewToken: string;
          requiresSharingAcknowledgement: boolean;
          after: Record<string, unknown>;
          result: ScopeExecution;
        };
        if (
          p.fingerprint !== fingerprint ||
          !confirmed ||
          previewToken !== p.previewToken ||
          (p.requiresSharingAcknowledgement && !acknowledgeSharedDestination)
        )
          throw new ProjectManagementError(
            'failed-precondition',
            'Retry exige a mesma intenção, prévia e confirmação.',
          );
        if (canonical(before) !== canonical(p.after))
          throw new ProjectManagementError(
            'failed-precondition',
            'Projeto alterado após a operação.',
          );
        return p.result;
      }
      assertProjectWritable(before);
      const inbound = await tx.get(
        this.db
          .collection('projects')
          .where('mergedInto', '==', input.projectId)
          .limit(1),
      );
      if (!inbound.empty)
        throw new ProjectManagementError(
          'failed-precondition',
          'Projeto com histórico de mesclagem exige revisão dedicada antes de alterar escopo.',
        );
      if (before.type !== 'personal' && before.type !== 'work')
        throw new ProjectManagementError(
          'failed-precondition',
          'Escopo legado desconhecido; revisão explícita necessária.',
        );
      const fromType = effectiveProjectType(before);
      if (fromType === 'invalid')
        throw new ProjectManagementError(
          'failed-precondition',
          'Escopo atual inválido.',
        );
      if (fromType === input.type)
        throw new ProjectManagementError(
          'failed-precondition',
          'Projeto já possui este escopo.',
        );
      // All historical documents count: hiding foreign tombstones would hide their evidence.
      const records = await tx.get(
        this.db
          .collectionGroup('records')
          .where('projectId', '==', input.projectId)
          .limit(2001),
      );
      if (records.docs.length > 2000)
        throw new ProjectManagementError(
          'resource-exhausted',
          'Projeto excede 2000 registros; alteração indisponível com segurança.',
        );
      for (const doc of records.docs) {
        const data = doc.data();
        if (
          data.uid !== uid ||
          doc.ref.path !== 'users/' + uid + '/records/' + doc.id
        )
          throw new ProjectManagementError(
            'failed-precondition',
            'Há registros de outros participantes ou propriedade inválida; escopo não alterado.',
          );
      }
      const requiresSharingAcknowledgement =
        fromType === 'personal' && input.type === 'work';
      const manifest = records.docs
        .map(
          (
            d,
          ): [
            string,
            number | undefined,
            number | undefined,
            Record<string, unknown>,
          ] => [
            d.ref.path,
            d.updateTime?.toMillis(),
            d.updateTime?.nanoseconds,
            d.data(),
          ],
        )
        .sort((a, b) => a[0].localeCompare(b[0]));
      const token = hash([
        uid,
        fingerprint,
        snapshot.updateTime?.toMillis(),
        snapshot.updateTime?.nanoseconds,
        before,
        manifest,
      ]);
      const warnings = requiresSharingAcknowledgement
        ? [
            'Global compartilha com a organização TODOS os metadados, assuntos, textos de registros e histórico associado. Confidencialidade é apresentação, não autorização.',
          ]
        : [
            'Pessoal restringe futuras leituras ao criador; não revoga cópias já lidas nem remove histórico.',
          ];
      if (!confirmed)
        return {
          mode: 'preview' as const,
          projectId: input.projectId,
          fromType,
          toType: input.type,
          recordCount: records.docs.length,
          requiresSharingAcknowledgement,
          warnings,
          previewToken: token,
        };
      if (previewToken !== token)
        throw new ProjectManagementError(
          'failed-precondition',
          'Prévia desatualizada; obtenha nova prévia e confirmação.',
        );
      if (requiresSharingAcknowledgement && !acknowledgeSharedDestination)
        throw new ProjectManagementError(
          'failed-precondition',
          'Confirme explicitamente a publicação para a organização.',
        );
      const updatedAt = new Date().toISOString(),
        after = { ...before, type: input.type, updatedAt, updatedBy: uid };
      const result: ScopeExecution = {
        mode: 'execution',
        projectId: input.projectId,
        type: input.type,
        updatedAt,
      };
      const receipt = {
        action: 'change-scope',
        authorUid: uid,
        reason: input.reason,
        requestId: input.requestId,
        fingerprint,
        previewToken: token,
        requiresSharingAcknowledgement,
        before,
        after,
        result,
        updatedAt,
      };
      if (Buffer.byteLength(canonical(receipt)) > 700000)
        throw new ProjectManagementError(
          'resource-exhausted',
          'Auditoria excede limite seguro.',
        );
      tx.update(ref, { type: input.type, updatedAt, updatedBy: uid });
      tx.create(audit, receipt);
      return result;
    });
  }
}
