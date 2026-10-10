import { createHash } from 'node:crypto';
import type { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import {
  assertProjectAccess,
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import {
  assertProjectWritable,
  ProjectManagementError,
} from '@work-track/core/registration/domain/project-management';
import {
  moveRecordInput,
  moveTopicInput,
  type MoveRecordInput,
  type MoveTopicInput,
  type MovementRepository,
} from '@work-track/core/registration/domain/record-movement';
import type { Topic } from '@work-track/core/registration/domain/work-model';
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
        typeof (t as Topic).id !== 'string' ||
        typeof (t as Topic).title !== 'string' ||
        typeof (t as Topic).description !== 'string',
    )
  )
    fail('Catálogo de tópicos inválido.');
  const result = project.topics as Topic[];
  if (new Set(result.map((t) => t.id)).size !== result.length)
    fail('IDs de tópicos duplicados.');
  return result;
}
function recordTopics(
  data: Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (
    !Array.isArray(data.topics) ||
    data.topics.some(
      (t) =>
        !t ||
        typeof t !== 'object' ||
        typeof (t as Record<string, unknown>).topicId !== 'string',
    )
  )
    fail('Tópicos do registro inválidos.');
  return data.topics as Array<Record<string, unknown>>;
}
const version = (
  s: DocumentSnapshot,
): [string, number | undefined, number | undefined, unknown] => [
  s.ref.path,
  s.updateTime?.toMillis(),
  s.updateTime?.nanoseconds,
  s.data(),
];
export class FirestoreRecordMovementRepository implements MovementRepository {
  constructor(private readonly db: Firestore) {}
  moveTopic(
    input: MoveTopicInput,
    uid: string,
  ): Promise<Record<string, unknown>> {
    return this.move('move_topic', moveTopicInput.parse(input), uid);
  }
  moveRecord(
    input: MoveRecordInput,
    uid: string,
  ): Promise<Record<string, unknown>> {
    return this.move('move_record', moveRecordInput.parse(input), uid);
  }
  private async move(
    operation: 'move_topic' | 'move_record',
    input: MoveTopicInput | MoveRecordInput,
    uid: string,
  ) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
      throw new ProjectManagementError(
        'permission-denied',
        'Usuário inválido.',
      );
    const { confirmed, previewToken, ...intent } = input,
      fingerprint = hash(intent),
      opId = hash([uid, operation, input.requestId]);
    const own = this.db.collection('users').doc(uid).collection('records'),
      receipt = this.db.collection('recordMovements').doc(opId);
    return this.db.runTransaction(async (tx) => {
      const prior = await tx.get(receipt);
      if (prior.exists) {
        const p = prior.data() as {
          authorUid: string;
          fingerprint: string;
          previewToken: string;
          after: Array<{ path: string; hash: string }>;
          projects: Array<{ path: string; hash: string }>;
          result: Record<string, unknown>;
        };
        if (
          p.authorUid !== uid ||
          p.fingerprint !== fingerprint ||
          !confirmed ||
          previewToken !== p.previewToken
        )
          fail('Retry exige a mesma operação, intenção e confirmação.');
        for (const entry of [...p.after, ...p.projects]) {
          const current = await tx.get(this.db.doc(entry.path));
          if (entry.path.startsWith('projects/'))
            assertProjectAccess(current.data(), uid);
          if (!current.exists || hash(current.data()) !== entry.hash)
            fail('Estado alterado após movimento; retry indisponível.');
        }
        return p.result;
      }
      let originId: string, sourceId: string, candidates: DocumentSnapshot[];
      if ('recordId' in input) {
        const ownerUid = input.recordOwnerUid ?? uid;
        const s = await tx.get(
          this.db
            .collection('users')
            .doc(ownerUid)
            .collection('records')
            .doc(input.recordId),
        );
        if (!s.exists || isDeletedRecord(s.data()!))
          throw new ProjectManagementError(
            'not-found',
            'Registro autorizado ativo não encontrado.',
          );
        const data = s.data()!;
        if (data.uid !== ownerUid)
          throw new ProjectManagementError(
            'not-found',
            'Registro autorizado ativo não encontrado.',
          );
        if (typeof data.projectId !== 'string')
          throw new ProjectManagementError(
            'not-found',
            'Registro autorizado ativo não encontrado.',
          );
        const recordProject = await tx.get(
          this.db.collection('projects').doc(data.projectId),
        );
        if (
          !canAccessProject(recordProject.data(), uid) ||
          (ownerUid !== uid &&
            effectiveProjectType(recordProject.data()!) !== 'work')
        )
          throw new ProjectManagementError(
            'not-found',
            'Registro autorizado ativo não encontrado.',
          );
        const rs = recordTopics(data);
        if (rs.length !== 1)
          fail(
            'Registro com múltiplos tópicos exige remapeamento explícito; movimento indisponível.',
          );
        if (typeof data.projectId !== 'string')
          fail('Projeto de origem inválido.');
        originId = data.projectId;
        sourceId = rs[0]!.topicId as string;
        candidates = [s];
      } else {
        originId = input.project_origin;
        sourceId = input.topic_origin;
        candidates = []; // Query only after project access and scope validation.
      }
      if (originId === input.project_target)
        fail('Escolha outro projeto de destino.');
      const sourceRef = this.db.collection('projects').doc(originId),
        targetRef = this.db.collection('projects').doc(input.project_target);
      const [sourceSnap, targetSnap] = await Promise.all([
        tx.get(sourceRef),
        tx.get(targetRef),
      ]);
      assertProjectAccess(sourceSnap.data(), uid);
      assertProjectAccess(targetSnap.data(), uid);
      const source = sourceSnap.data()! as Record<string, unknown>,
        target = targetSnap.data()! as Record<string, unknown>;
      assertProjectWritable(source);
      assertProjectWritable(target);
      const [inboundSource, inboundTarget] = await Promise.all([
        tx.get(
          this.db
            .collection('projects')
            .where('mergedInto', '==', originId)
            .limit(1),
        ),
        tx.get(
          this.db
            .collection('projects')
            .where('mergedInto', '==', input.project_target)
            .limit(1),
        ),
      ]);
      if (!inboundSource.empty || !inboundTarget.empty)
        fail('Projeto com histórico de mesclagem exige revisão dedicada.');
      if (effectiveProjectType(source) !== effectiveProjectType(target))
        fail(
          'Movimento entre Pessoal e Global indisponível; escolha projetos do mesmo escopo.',
        );
      if (
        typeof target.title !== 'string' ||
        typeof target.description !== 'string'
      )
        fail('Metadados de destino inválidos.');
      const sourceTopics = topics(source),
        targetTopics = topics(target),
        sourceTopic = sourceTopics.find((t) => t.id === sourceId);
      if (!sourceTopic || sourceTopic.archived || sourceTopic.mergedIntoTopicId)
        fail('Tópico de origem deve ser canônico e ativo.');
      // A source alias can match functional reports without literal record membership. Reject rather than omit its records.
      if (sourceTopics.some((t) => t.mergedIntoTopicId))
        fail(
          'Origem com aliases exige conciliação dedicada; nenhuma atividade movida.',
        );
      const corporate = effectiveProjectType(source) === 'work';
      if (!('recordId' in input)) {
        const query = corporate ? this.db.collectionGroup('records') : own;
        const scan = await tx.get(
          query.where('projectId', '==', originId).limit(2001),
        );
        if (scan.docs.length > 2000)
          throw new ProjectManagementError(
            'resource-exhausted',
            'Contexto excede 2000 registros físicos; movimento indisponível.',
          );
        candidates = scan.docs.filter(
          (d) =>
            !isDeletedRecord(d.data()) &&
            recordTopics(d.data()).some((t) => t.topicId === sourceId),
        );
      }
      if (candidates.length === 0)
        fail('Nenhum registro ativo autorizado neste tópico.');
      if (candidates.length > 100)
        throw new ProjectManagementError(
          'resource-exhausted',
          'Movimento atômico limitado a 100 registros; nenhuma atividade movida.',
        );
      for (const s of candidates) {
        const d = s.data()!;
        const ownerUid: unknown = d.uid;
        if (
          typeof ownerUid !== 'string' ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid) ||
          s.ref.path !== 'users/' + ownerUid + '/records/' + s.id
        )
          fail('Propriedade inválida.');
        if ((!corporate && ownerUid !== uid) || d.projectId !== originId)
          throw new ProjectManagementError(
            'not-found',
            'Registro autorizado ativo não encontrado.',
          );
        if (d.topicResolution !== undefined)
          fail(
            'Registro com resolução histórica de alias exige revisão dedicada.',
          );
        if (recordTopics(d).length !== 1)
          fail('Há registros com múltiplos tópicos; nenhuma atividade movida.');
      }
      let dest: Topic | undefined,
        willCreate = false;
      if (input.topic_target) {
        dest = targetTopics.find((t) => t.id === input.topic_target);
        if (!dest || dest.archived || dest.mergedIntoTopicId)
          fail('Tópico de destino deve existir, ser canônico e ativo.');
      } else {
        const matches = targetTopics.filter(
          (t) =>
            !t.archived &&
            !t.mergedIntoTopicId &&
            normalize(t.title) === normalize(sourceTopic.title),
        );
        if (matches.length > 1)
          fail('Nome de destino ambíguo; selecione topic_target explícito.');
        dest = matches[0];
        if (!dest) {
          const id =
            'moved_' +
            hash([input.project_target, normalize(sourceTopic.title)]).slice(
              0,
              32,
            );
          if (targetTopics.some((t) => t.id === id))
            fail('ID de destino em conflito; selecione tópico explícito.');
          dest = {
            id,
            title: sourceTopic.title,
            description: sourceTopic.description,
          };
          willCreate = true;
        }
      }
      const destination = dest;
      const token = hash([
        uid,
        operation,
        fingerprint,
        version(sourceSnap),
        version(targetSnap),
        candidates.map(version).sort((a, b) => a[0].localeCompare(b[0])),
        destination,
      ]);
      const records = candidates
        .map((s) => ({
          recordId: s.id,
          ownerUid: s.data()!.uid as string,
          path: s.ref.path,
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
      const recordIds = records.map((r) => r.recordId);
      const participantUids = [
        ...new Set(records.map((r) => r.ownerUid)),
      ].sort();
      const warnings = [
        corporate
          ? 'Registros corporativos de todos os participantes deste tópico serão movidos; a propriedade de cada registro será preservada.'
          : 'Somente seus registros pessoais serão movidos.',
        'O tópico original permanece para histórico; nenhum projeto será arquivado ou apagado.',
        'Identidade, textos, tempos e distribuições são preservados; relatórios por projeto e estimativas podem mudar.',
      ];
      const updatedAt = new Date().toISOString(),
        audits = candidates.map((s) => {
          const before = s.data()! as Record<string, unknown>,
            after = {
              ...before,
              projectId: input.project_target,
              topics: recordTopics(before).map((t) => ({
                ...t,
                topicId: destination.id,
              })),
              projectSnapshot: {
                title: target.title,
                description: target.description,
              },
              topicSnapshots: [destination],
              updatedAt,
              updatedBy: uid,
            };
          return {
            s,
            before,
            after,
            audit: {
              action: operation,
              authorUid: uid,
              recordOwnerUid: before.uid,
              recordPath: s.ref.path,
              reason: input.reason,
              requestId: input.requestId,
              operationId: opId,
              updatedAt,
              before,
              after,
            },
          };
        });
      if (
        audits.some((a) => Buffer.byteLength(canonical(a.audit)) > 700000) ||
        audits.reduce(
          (n, a) =>
            n +
            Buffer.byteLength(canonical(a.audit)) +
            Buffer.byteLength(canonical(a.after)),
          0,
        ) > 7000000
      )
        throw new ProjectManagementError(
          'resource-exhausted',
          'Auditoria excede limite atômico seguro; nenhuma atividade movida.',
        );
      const sourceAfter = {
        ...source,
        lastMovementOperationId: opId,
        updatedAt,
        updatedBy: uid,
      };
      const sourceAudit = {
        action: operation,
        authorUid: uid,
        reason: input.reason,
        operationId: opId,
        before: source,
        after: sourceAfter,
        updatedAt,
        recordCount: candidates.length,
      };
      const targetAfter = willCreate
        ? {
            ...target,
            topics: [...targetTopics, destination],
            updatedAt,
            updatedBy: uid,
          }
        : target;
      const result = {
        mode: 'execution',
        operation,
        project_origin: originId,
        project_target: input.project_target,
        topic_target: destination.id,
        recordCount: candidates.length,
        recordIds,
        records,
        participantUids,
        updatedAt,
      };
      const targetAudit = {
        action: 'movement-create-topic',
        authorUid: uid,
        reason: input.reason,
        operationId: opId,
        before: target,
        after: targetAfter,
        updatedAt,
      };
      if (
        Buffer.byteLength(canonical(sourceAudit)) > 700000 ||
        (willCreate && Buffer.byteLength(canonical(targetAudit)) > 700000)
      )
        throw new ProjectManagementError(
          'resource-exhausted',
          'Auditoria do projeto excede limite seguro.',
        );
      if (!confirmed)
        return {
          mode: 'preview',
          operation,
          project_origin: originId,
          topic_origin: sourceId,
          project_target: input.project_target,
          topic_target: destination.id,
          resolvedTopic: {
            id: destination.id,
            title: destination.title,
            willCreate,
          },
          recordCount: candidates.length,
          recordIds,
          records,
          participantUids,
          warnings,
          previewToken: token,
        };
      if (previewToken !== token)
        fail('Prévia desatualizada; obtenha nova prévia e confirmação.');
      // Registration and other movement writers read this source document inside their transaction.
      tx.update(sourceRef, {
        lastMovementOperationId: opId,
        updatedAt,
        updatedBy: uid,
      });
      tx.create(
        sourceRef.collection('audit').doc('movement_' + opId),
        sourceAudit,
      );
      if (willCreate) {
        tx.update(targetRef, {
          topics: targetAfter.topics,
          updatedAt,
          updatedBy: uid,
        });
        tx.create(targetRef.collection('audit').doc('movement_' + opId), {
          action: 'movement-create-topic',
          authorUid: uid,
          reason: input.reason,
          operationId: opId,
          before: target,
          after: targetAfter,
          updatedAt,
        });
      }
      for (const a of audits) {
        tx.update(a.s.ref, {
          projectId: a.after.projectId,
          topics: a.after.topics,
          projectSnapshot: a.after.projectSnapshot,
          topicSnapshots: a.after.topicSnapshots,
          updatedAt,
          updatedBy: uid,
        });
        tx.create(a.s.ref.collection('audit').doc('movement_' + opId), a.audit);
      }
      tx.create(receipt, {
        authorUid: uid,
        fingerprint,
        previewToken: token,
        result,
        after: audits.map((a) => ({ path: a.s.ref.path, hash: hash(a.after) })),
        projects: [
          { path: sourceRef.path, hash: hash(sourceAfter) },
          { path: targetRef.path, hash: hash(targetAfter) },
        ],
      });
      return result;
    });
  }
}
