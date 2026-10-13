import { doc, type Firestore } from 'firebase/firestore';
import { hash, canonical } from './web-transaction-adapter';
import { readTransaction } from './transaction-read';
import { runMeasuredTransaction } from './transaction-write';
import {
  assertProjectAccess,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import {
  assertProjectWritable,
  ProjectManagementError,
} from '@work-track/core/registration/domain/project-management';
import {
  moveRecordInput,
  type MoveRecordInput,
  type MoveTopicInput,
  type MovementRepository,
} from '@work-track/core/registration/domain/record-movement';
import type { Topic } from '@work-track/core/registration/domain/work-model';
const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
function fail(message: string): never {
  throw new ProjectManagementError('failed-precondition', message);
}
function topics(project: Record<string, unknown>): Topic[] {
  if (
    !Array.isArray(project.topics) ||
    project.topics.some(
      (t) =>
        !t ||
        typeof t !== 'object' ||
        typeof t.id !== 'string' ||
        typeof t.title !== 'string' ||
        typeof t.description !== 'string',
    )
  )
    fail('Catálogo de tópicos inválido.');
  const result = project.topics as Topic[];
  if (new Set(result.map((t) => t.id)).size !== result.length)
    fail('IDs de tópicos duplicados.');
  return result;
}
// prettier-ignore
export class WebRecordMovementRepository implements MovementRepository {
  constructor(private readonly db: Firestore) {}
  moveTopic(input: MoveTopicInput, uid: string): Promise<Record<string, unknown>> {
    void input;
    void uid;
    throw new Error('moveTopic permanece no backend.');
  }
  async moveRecord(raw: MoveRecordInput, uid: string): Promise<Record<string, unknown>> {
    const input = moveRecordInput.parse(raw);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || (input.recordOwnerUid && input.recordOwnerUid !== uid))
      throw new ProjectManagementError('permission-denied', 'Web moveRecord somente registros próprios.');
    const { confirmed, previewToken, ...intent } = input;
    const fingerprint = hash(intent),
      operationId = hash([uid, 'move_record', input.requestId]);
    const ref = doc(this.db, 'users', uid, 'records', input.recordId);
    const audit = doc(this.db, 'users', uid, 'records', input.recordId, 'audit', 'movement_' + operationId);
    const operation = 'web-record-movement.move-record';
    return runMeasuredTransaction(this.db, operation, async (tx) => {
      const [snapshot, prior] = await Promise.all([
        readTransaction(tx, ref, operation),
        readTransaction(tx, audit, operation),
      ]);
      const before = snapshot.data();
      if (!snapshot.exists() || before!.uid !== uid || isDeletedRecord(before!) || typeof before!.projectId !== 'string')
        throw new ProjectManagementError('not-found', 'Registro autorizado ativo não encontrado.');
      const p = prior.exists() ? prior.data() : undefined;
      const originId = p ? p.result.project_origin : before!.projectId;
      if (typeof originId !== 'string') fail('Projeto de origem inválido.');
      const sourceRef = doc(this.db, 'projects', originId),
        targetRef = doc(this.db, 'projects', input.project_target);
      const [sourceSnap, targetSnap] = await Promise.all([
        readTransaction(tx, sourceRef, operation),
        readTransaction(tx, targetRef, operation),
      ]);
      assertProjectAccess(sourceSnap.data(), uid);
      assertProjectAccess(targetSnap.data(), uid);
      const source = sourceSnap.data()! as Record<string, unknown>,
        target = targetSnap.data()! as Record<string, unknown>;
      assertProjectWritable(source);
      assertProjectWritable(target);
      if (p) {
        if (p.authorUid !== uid || p.fingerprint !== fingerprint || !confirmed || previewToken !== p.previewToken)
          fail('Retry exige a mesma operação, intenção e confirmação.');
        if (canonical(before) !== canonical(p.after) || hash(source) !== p.sourceHash || hash(target) !== p.targetHash)
          fail('Estado alterado após movimento; retry indisponível.');
        return p.result as Record<string, unknown>;
      }
      if (originId === input.project_target) fail('Escolha outro projeto de destino.');
      if (effectiveProjectType(source) !== effectiveProjectType(target))
        fail('Movimento entre Pessoal e Global indisponível; escolha projetos do mesmo escopo.');
      const allocations = before!.topics;
      if (!Array.isArray(allocations) || allocations.length !== 1 || !allocations[0] || typeof allocations[0].topicId !== 'string')
        fail('Registro deve possuir um único tópico válido.');
      if (before!.topicResolution !== undefined) fail('Registro com resolução histórica de alias exige revisão dedicada.');
      const sourceTopics = topics(source),
        targetTopics = topics(target);
      const sourceTopic = sourceTopics.find((t) => t.id === allocations[0].topicId);
      if (!sourceTopic || sourceTopic.archived || sourceTopics.some((t) => t.mergedIntoTopicId))
        fail('Tópico de origem deve ser canônico e ativo; aliases exigem revisão dedicada.');
      if (typeof target.title !== 'string' || typeof target.description !== 'string') fail('Metadados de destino inválidos.');
      let destination: Topic | undefined,
        willCreate = false;
      if (input.topic_target) {
        destination = targetTopics.find((t) => t.id === input.topic_target);
        if (!destination || destination.archived || destination.mergedIntoTopicId)
          fail('Tópico de destino deve existir, ser canônico e ativo.');
      } else {
        const matches = targetTopics.filter(
          (t) => !t.archived && !t.mergedIntoTopicId && normalize(t.title) === normalize(sourceTopic.title),
        );
        if (matches.length > 1) fail('Nome de destino ambíguo; selecione topic_target explícito.');
        destination = matches[0];
        if (!destination) {
          const id = 'moved_' + hash([input.project_target, normalize(sourceTopic.title)]).slice(0, 32);
          if (targetTopics.some((t) => t.id === id)) fail('ID de destino em conflito; selecione tópico explícito.');
          destination = {
            id,
            title: sourceTopic.title,
            description: sourceTopic.description,
          };
          willCreate = true;
        }
      }
      const token = hash([uid, fingerprint, ref.path, before, sourceRef.path, source, targetRef.path, target, destination]);
      const common = {
        operation: 'move_record',
        project_origin: originId,
        project_target: input.project_target,
        topic_target: destination.id,
        recordCount: 1,
        recordIds: [input.recordId],
        records: [{ recordId: input.recordId, ownerUid: uid, path: ref.path }],
        participantUids: [uid],
      };
      if (!confirmed)
        return {
          ...common,
          mode: 'preview',
          topic_origin: sourceTopic.id,
          resolvedTopic: {
            id: destination.id,
            title: destination.title,
            willCreate,
          },
          warnings: [
            'Somente seu registro será movido; identidade, textos, tempos e distribuições são preservados.',
            'O tópico original permanece para histórico; relatórios por projeto e estimativas podem mudar.',
          ],
          previewToken: token,
        };
      if (previewToken !== token) fail('Prévia desatualizada; obtenha nova prévia e confirmação.');
      const updatedAt = new Date().toISOString();
      const patch = {
        projectId: input.project_target,
        topics: [{ ...allocations[0], topicId: destination.id }],
        projectSnapshot: {
          title: target.title,
          description: target.description,
        },
        topicSnapshots: [destination],
        updatedAt,
        updatedBy: uid,
      };
      const after = { ...before, ...patch },
        targetAfter = willCreate ? { ...target, topics: [...targetTopics, destination] } : target;
      const result = { ...common, mode: 'execution', updatedAt };
      const receipt = {
        action: 'move_record',
        authorUid: uid,
        recordOwnerUid: uid,
        recordPath: ref.path,
        reason: input.reason,
        requestId: input.requestId,
        operationId,
        fingerprint,
        previewToken: token,
        before,
        after,
        sourceHash: hash(source),
        targetHash: hash(targetAfter),
        result,
        updatedAt,
      };
      if (new TextEncoder().encode(canonical(receipt)).byteLength > 700000)
        throw new ProjectManagementError('resource-exhausted', 'Auditoria excede limite seguro.');
      if (willCreate) tx.update(targetRef, { topics: targetAfter.topics });
      tx.update(ref, patch);
      tx.set(audit, receipt);
      return result;
    });
  }
}
