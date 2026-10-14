import { createHash } from 'node:crypto';
import {
  assertProjectAccess,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Project,
  Topic,
} from '@work-track/core/registration/domain/work-model';
import { ProjectManagementError } from '@work-track/core/registration/domain/project-management';
import {
  previewTopicMerge,
  type TopicManagementRepository,
  type MergeTopicsInput,
  type ListTopicMergesInput,
  type TopicMergeAudit,
  type TopicMergeExecution,
} from '@work-track/core/registration/domain/topic-management';
export class FirestoreTopicManagementRepository implements TopicManagementRepository {
  constructor(private readonly db: Firestore) {}
  async mergeTopics(input: MergeTopicsInput, uid: string) {
    const ref = this.db.collection('projects').doc(input.projectId);
    if (!input.confirmed) {
      const s = await ref.get();
      if (!s.exists)
        throw new ProjectManagementError(
          'not-found',
          'Projeto não encontrado.',
        );
      assertProjectAccess(s.data(), uid);
      return previewTopicMerge(s.data() as Project, input);
    }
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          projectId: input.projectId,
          sourceTopicIds: [...input.sourceTopicIds].sort(),
          targetTopicId: input.targetTopicId,
          reason: input.reason,
        }),
      )
      .digest('hex');
    const id = createHash('sha256')
      .update(uid + ':' + input.requestId)
      .digest('hex');
    const auditRef = ref.collection('topicMerges').doc(id);
    return this.db.runTransaction(async (tx) => {
      const accessSnapshot = await tx.get(ref);
      assertProjectAccess(accessSnapshot.data(), uid);
      const existing = await tx.get(auditRef);
      if (existing.exists) {
        const data = existing.data()!;
        if (data.fingerprint !== fingerprint)
          throw new ProjectManagementError(
            'already-exists',
            'requestId já usado com outra operação.',
          );
        return data.result as TopicMergeExecution;
      }
      const snapshot = await tx.get(ref);
      if (!snapshot.exists)
        throw new ProjectManagementError(
          'not-found',
          'Projeto não encontrado.',
        );
      const project = snapshot.data() as Project;
      previewTopicMerge(project, input);
      const recordedAt = new Date().toISOString();
      const before = project.topics.map((t) => ({ ...t }));
      const removed = new Set(input.sourceTopicIds);
      const after: Topic[] = before.filter((t) => !removed.has(t.id));
      const target = after.find((t) => t.id === input.targetTopicId)!;
      // Topic allocations/snapshots are arrays of variable-shaped objects:
      // Firestore has no nested array-member ID query. Query projectId and
      // retain the topic-reference migration residual here.
      const scan = await tx.get(
        this.db
          .collectionGroup('records')
          .where('projectId', '==', input.projectId)
          .limit(2001),
      );
      if (scan.docs.length > 2000)
        throw new ProjectManagementError(
          'resource-exhausted',
          'Contexto excede 2000 registros físicos; nenhum tópico foi removido.',
        );
      const migrations = scan.docs.flatMap((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const owner = data.uid;
        if (
          typeof owner !== 'string' ||
          doc.ref.path !== 'users/' + owner + '/records/' + doc.id ||
          (effectiveProjectType(project) === 'personal' &&
            owner !== project.createdBy)
        )
          throw new ProjectManagementError(
            'failed-precondition',
            'Propriedade inválida; nenhum tópico foi removido.',
          );
        if (!Array.isArray(data.topics))
          throw new ProjectManagementError(
            'failed-precondition',
            'Distribuição de tópicos inválida; nenhum tópico foi removido.',
          );
        const allocations = data.topics as Record<string, unknown>[];
        if (
          allocations.some(
            (a) =>
              !a ||
              typeof a.topicId !== 'string' ||
              ['percentage', 'durationMinutes'].some(
                (key) =>
                  a[key] !== undefined &&
                  (typeof a[key] !== 'number' ||
                    !Number.isFinite(a[key]) ||
                    a[key] <= 0),
              ),
          )
        )
          throw new ProjectManagementError(
            'failed-precondition',
            'Distribuição de tópicos inválida; nenhum tópico foi removido.',
          );
        const snapshots = Array.isArray(data.topicSnapshots)
          ? (data.topicSnapshots as Record<string, unknown>[])
          : [];
        if (snapshots.some((s) => !s || typeof s.id !== 'string'))
          throw new ProjectManagementError(
            'failed-precondition',
            'Snapshots de tópicos inválidos; nenhum tópico foi removido.',
          );
        if (
          !allocations.some((a) => removed.has(a.topicId as string)) &&
          !snapshots.some((s) => removed.has(s.id as string))
        )
          return [];
        const mapped: Record<string, unknown>[] = allocations.map((a) =>
          removed.has(a.topicId as string)
            ? { ...a, topicId: target.id }
            : { ...a },
        );
        const topics: Record<string, unknown>[] = [];
        for (const allocation of mapped) {
          const existing = topics.find((a) => a.topicId === allocation.topicId);
          if (!existing) {
            topics.push(allocation);
            continue;
          }
          const keys = ['percentage', 'durationMinutes'] as const;
          const key = keys.find(
            (k) =>
              typeof existing[k] === 'number' &&
              typeof allocation[k] === 'number',
          );
          if (
            !key ||
            keys.some(
              (k) =>
                k !== key &&
                (existing[k] !== undefined || allocation[k] !== undefined),
            )
          )
            throw new ProjectManagementError(
              'failed-precondition',
              'Alocações convergentes ambíguas; informe repartição explícita antes de mesclar.',
            );
          existing[key] =
            (existing[key] as number) + (allocation[key] as number);
          if (
            !Number.isFinite(existing[key]) ||
            (key === 'percentage' && (existing[key] as number) > 100)
          )
            throw new ProjectManagementError(
              'failed-precondition',
              'Alocação consolidada inválida; nenhum tópico foi removido.',
            );
        }
        const topicSnapshots = snapshots.filter(
          (s) => !removed.has(s.id as string),
        );
        if (
          topics.some((a) => a.topicId === target.id) &&
          !topicSnapshots.some((s) => s.id === target.id)
        )
          topicSnapshots.push({ ...target });
        const patch = {
          topics,
          topicSnapshots,
          updatedAt: recordedAt,
          updatedBy: uid,
        };
        return [{ doc, before: data, after: { ...data, ...patch }, patch }];
      });
      if (migrations.length > 100)
        throw new ProjectManagementError(
          'resource-exhausted',
          'Mesclagem atômica limitada a 100 registros; nenhum tópico foi removido.',
        );
      const result: TopicMergeExecution = {
        mode: 'execution',
        status: 'completed',
        projectId: input.projectId,
        auditId: id,
        updatedAt: recordedAt,
        sourceTopicIds: [...input.sourceTopicIds],
        targetTopicId: input.targetTopicId,
        preservesRecords: true,
        migratedRecordCount: migrations.length,
        removedTopicIds: [...removed],
      };
      const audit: TopicMergeAudit = {
        id,
        projectId: input.projectId,
        authorUid: uid,
        reason: input.reason!,
        recordedAt,
        before,
        after,
        sourceTopicIds: [...input.sourceTopicIds],
        targetTopicId: input.targetTopicId,
      };
      if (
        Buffer.byteLength(
          JSON.stringify({ ...audit, fingerprint, result }),
          'utf8',
        ) > 900_000
      )
        throw new ProjectManagementError(
          'failed-precondition',
          'Catálogo grande demais para auditoria atômica; nenhum tópico foi alterado.',
        );
      const recordAudits = migrations.map((m) => ({
        action: 'merge-topics',
        authorUid: uid,
        recordOwnerUid: m.before.uid,
        recordPath: m.doc.ref.path,
        reason: input.reason,
        requestId: input.requestId,
        operationId: id,
        updatedAt: recordedAt,
        before: m.before,
        after: m.after,
      }));
      if (
        recordAudits.some(
          (a) => Buffer.byteLength(JSON.stringify(a)) > 700000,
        ) ||
        recordAudits.reduce(
          (n, a) => n + Buffer.byteLength(JSON.stringify(a)),
          0,
        ) +
          migrations.reduce(
            (n, m) => n + Buffer.byteLength(JSON.stringify(m.after)),
            0,
          ) >
          7000000
      )
        throw new ProjectManagementError(
          'resource-exhausted',
          'Auditoria excede limite atômico seguro; nenhum tópico foi removido.',
        );
      for (const [index, migration] of migrations.entries()) {
        tx.update(migration.doc.ref, migration.patch);
        tx.create(
          migration.doc.ref.collection('edits').doc(id),
          recordAudits[index]!,
        );
      }
      tx.update(ref, { topics: after, updatedAt: recordedAt, updatedBy: uid });
      tx.create(auditRef, { ...audit, fingerprint, result });
      return result;
    });
  }
  async listTopicMerges(input: ListTopicMergesInput, uid: string) {
    const ref = this.db.collection('projects').doc(input.projectId);
    const accessSnapshot = await ref.get();
    assertProjectAccess(accessSnapshot.data(), uid);
    if (!accessSnapshot.exists)
      throw new ProjectManagementError('not-found', 'Projeto não encontrado.');
    let query = ref
      .collection('topicMerges')
      .orderBy('__name__')
      .limit(input.limit + 1);
    if (input.cursor) {
      const cursor = await ref
        .collection('topicMerges')
        .doc(input.cursor)
        .get();
      if (!cursor.exists)
        throw new ProjectManagementError(
          'invalid-argument',
          'Cursor de auditoria não pertence ao projeto.',
        );
      query = query.startAfter(cursor);
    }
    const snapshot = await query.get();
    const selected = snapshot.docs.slice(0, input.limit);
    const items = selected.map((d) => {
      const a = d.data() as TopicMergeAudit;
      return {
        id: d.id,
        projectId: a.projectId,
        authorUid: a.authorUid,
        reason: a.reason,
        recordedAt: a.recordedAt,
        before: a.before,
        after: a.after,
        sourceTopicIds: a.sourceTopicIds,
        targetTopicId: a.targetTopicId,
      };
    });
    return {
      items,
      ...(snapshot.docs.length > input.limit
        ? { nextCursor: selected.at(-1)!.id }
        : {}),
    };
  }
}
