import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { hash, canonical } from './web-transaction-adapter';
import { readTransaction } from './transaction-read';
import {
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import {
  ProjectManagementError,
  assertProjectWritable,
} from '@work-track/core/registration/domain/project-management';
import {
  projectScopeInput,
  type ProjectScopeInput,
  type ProjectScopeRepository,
  type ScopePreview,
  type ScopeExecution,
} from '@work-track/core/registration/domain/project-scope';
function fail(message: string): never {
  throw new ProjectManagementError('failed-precondition', message);
}
export class WebProjectScopeRepository implements ProjectScopeRepository {
  constructor(private readonly db: Firestore) {}
  async changeScope(
    raw: ProjectScopeInput,
    uid: string,
  ): Promise<ScopePreview | ScopeExecution> {
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
    const ref = doc(this.db, 'projects', input.projectId);
    const audit = doc(
      this.db,
      'projects',
      input.projectId,
      'audit',
      'scope_' + operationId,
    );
    return runTransaction(this.db, async (tx) => {
      const operation = 'web-project-scope.change-scope';
      const [snapshot, prior] = await Promise.all([
        readTransaction(tx, ref, operation),
        readTransaction(tx, audit, operation),
      ]);
      const before = snapshot.data();
      if (!snapshot.exists() || !canAccessProject(before, uid))
        throw new ProjectManagementError(
          'not-found',
          'Projeto não encontrado.',
        );
      assertProjectWritable(before!);
      if (prior.exists()) {
        const p = prior.data();
        if (
          p.authorUid !== uid ||
          p.fingerprint !== fingerprint ||
          !confirmed ||
          previewToken !== p.previewToken ||
          (p.requiresSharingAcknowledgement && !acknowledgeSharedDestination)
        )
          fail('Retry exige a mesma intenção, prévia e confirmação.');
        if (canonical(before) !== canonical(p.after))
          fail('Projeto alterado após a operação.');
        return p.result as ScopeExecution;
      }
      const fromType = effectiveProjectType(before!);
      if (fromType === 'invalid' || fromType === input.type)
        fail('Escopo atual inválido ou já possui este escopo.');
      const requiresSharingAcknowledgement =
        fromType === 'personal' && input.type === 'work';
      const token = hash([uid, fingerprint, ref.path, before]);
      const warnings = requiresSharingAcknowledgement
        ? [
            'Global compartilha com a organização TODOS os metadados, tópicos, textos de registros e histórico associado. Confidencialidade é apresentação, não autorização.',
          ]
        : [
            'Pessoal restringe futuras leituras ao criador; não revoga cópias já lidas nem remove histórico.',
          ];
      // No record scan: this preview intentionally does not claim a record total.
      if (!confirmed)
        return {
          mode: 'preview',
          projectId: input.projectId,
          fromType,
          toType: input.type,
          requiresSharingAcknowledgement,
          warnings,
          previewToken: token,
        } as ScopePreview;
      if (previewToken !== token)
        fail('Prévia desatualizada; obtenha nova prévia e confirmação.');
      if (requiresSharingAcknowledgement && !acknowledgeSharedDestination)
        fail('Confirme explicitamente a publicação para a organização.');
      const updatedAt = new Date().toISOString(),
        after = { ...before, type: input.type };
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
      if (new TextEncoder().encode(canonical(receipt)).byteLength > 700000)
        throw new ProjectManagementError(
          'resource-exhausted',
          'Auditoria excede limite seguro.',
        );
      tx.update(ref, { type: input.type });
      tx.set(audit, receipt);
      return result;
    });
  }
}
