import { createHash } from 'node:crypto';
import { assertProjectAccess } from '../domain/project-access.js';
import type { Firestore } from 'firebase-admin/firestore';
import type { Project, Topic } from '../domain/work-model.js';
import { ProjectManagementError } from '../domain/project-management.js';
import {
  previewTopicMerge,
  type TopicManagementRepository,
  type MergeTopicsInput,
  type ListTopicMergesInput,
  type TopicMergeAudit,
  type TopicMergeExecution,
} from '../domain/topic-management.js';
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
      const after: Topic[] = before.map((t) =>
        input.sourceTopicIds.includes(t.id)
          ? {
              ...t,
              archived: true,
              mergedIntoTopicId: input.targetTopicId,
              mergedAt: recordedAt,
              mergedBy: uid,
            }
          : t,
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
      tx.update(ref, { topics: after, updatedAt: recordedAt });
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
