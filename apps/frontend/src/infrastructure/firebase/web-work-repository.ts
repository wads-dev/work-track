import { buildRecordEditPlan } from '@work-track/data/repositories/record-edit-plan';
import {
  collection,
  deleteField,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import {
  archiveProjectInput,
  updateProjectInput,
  assertArchiveAllowed,
  assertProjectWritable,
  ProjectManagementError,
} from '@work-track/core/registration/domain/project-management';
import {
  assertProjectAccess,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import { updateRecordInput } from '@work-track/core/registration/domain/record-edit';
import { listTopicMergesInput } from '@work-track/core/registration/domain/topic-management';

import { updateTopicInput } from '@work-track/core/registration/domain/work-model';
import { normalize } from '@work-track/core/shared/text/normalize';
export class WebWorkRepository {
  constructor(private readonly db: Firestore) {}
  async updateTopic(raw: unknown, uid: string) {
    const input = updateTopicInput.parse(raw);
    return this.projectWrite(
      input,
      uid,
      'topic_' + uid + '_' + input.requestId,
      (before) => {
        assertProjectWritable(before);
        const topics = before.topics as Array<Record<string, unknown>>;
        const topic = topics.find((t) => t.id === input.topicId);
        if (!topic || topic.archived || topic.mergedIntoTopicId)
          throw new Error('Tópico ativo não encontrado.');
        const after: Record<string, unknown> = {
          ...topic,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.githubUrl !== undefined
            ? { githubUrl: input.githubUrl }
            : {}),
        };
        if (
          topics.some(
            (t) =>
              t.id !== after.id &&
              !t.archived &&
              normalize(String(t.title)) === normalize(String(after.title)),
          )
        )
          throw new Error('Nome de tópico já utilizado.');
        return { topics: topics.map((t) => (t.id === after.id ? after : t)) };
      },
      'update-topic',
    );
  }
  async archiveProject(raw: unknown, uid: string) {
    const input = archiveProjectInput.parse(raw);
    return this.projectWrite(
      input,
      uid,
      'archive_' + input.requestId,
      (before) => {
        assertArchiveAllowed(before, input.archived);
        return { archived: input.archived };
      },
      'archive',
    );
  }
  async updateProject(raw: unknown, uid: string) {
    const input = updateProjectInput.parse(raw);
    return this.projectWrite(input, uid, input.requestId, (before) => {
      assertProjectWritable(before);
      if (
        input.type !== undefined &&
        input.type !== effectiveProjectType(before)
      )
        throw new ProjectManagementError(
          'failed-precondition',
          'Alteração de escopo exige fluxo explícito.',
        );
      const { projectId, requestId, reason, ...metadata } = input;
      void projectId;
      void requestId;
      void reason;
      return {
        ...metadata,
        ...(metadata.confidential &&
        !metadata.publicAlias &&
        !before.publicAlias
          ? { publicAlias: 'Projeto reservado' }
          : {}),
      };
    });
  }
  private async projectWrite(
    input: { projectId: string; reason: string },
    uid: string,
    auditId: string,
    build: (before: Record<string, unknown>) => Record<string, unknown>,
    action?: string,
  ) {
    const ref = doc(this.db, 'projects', input.projectId),
      audit = doc(ref, 'audit', auditId);
    return runTransaction(this.db, async (tx) => {
      const snapshot = await tx.get(ref),
        prior = await tx.get(audit);
      const before = snapshot.data();
      assertProjectAccess(before, uid);
      if (prior.exists()) {
        const p = prior.data();
        if (p.authorUid !== uid || p.request !== JSON.stringify(input))
          throw new ProjectManagementError(
            'invalid-argument',
            'requestId já utilizado.',
          );
        return p.result;
      }
      const metadata = build(before!),
        updatedAt = new Date().toISOString();
      const after: Record<string, unknown> = {
        ...before,
        ...metadata,
        updatedAt,
        updatedBy: uid,
      };
      const patch: Record<string, unknown> = {
        ...metadata,
        updatedAt,
        updatedBy: uid,
      };
      if (metadata.githubUrl === null) {
        delete after.githubUrl;
        patch.githubUrl = deleteField();
      }
      const result =
        action === 'archive'
          ? {
              projectId: input.projectId,
              archived: metadata.archived,
              updatedAt,
            }
          : { projectId: input.projectId, project: after, updatedAt };
      tx.update(ref, patch);
      tx.set(audit, {
        authorUid: uid,
        reason: input.reason,
        request: JSON.stringify(input),
        ...(action ? { action } : {}),
        before,
        after,
        recordedAt: serverTimestamp(),
        result,
      });
      return result;
    });
  }
  async updateRecord(raw: unknown, uid: string) {
    const input = updateRecordInput.parse(raw),
      ref = doc(this.db, 'users', uid, 'records', input.recordId);
    const audit = input.requestId
      ? doc(ref, 'audit', input.requestId)
      : doc(collection(ref, 'audit'));
    return runTransaction(this.db, async (tx) => {
      const snapshot = await tx.get(ref),
        prior = await tx.get(audit),
        before = snapshot.data();
      if (!before || before.uid !== uid)
        throw new ProjectManagementError(
          'not-found',
          'Registro próprio não encontrado.',
        );
      const origin = await tx.get(doc(this.db, 'projects', before.projectId));
      assertProjectAccess(origin.data(), uid);
      const target = input.projectId
        ? await tx.get(doc(this.db, 'projects', input.projectId))
        : origin;
      assertProjectAccess(target.data(), uid);
      if (prior.exists()) {
        const p = prior.data();
        if (p.authorUid !== uid || p.request !== JSON.stringify(input))
          throw new ProjectManagementError(
            'invalid-argument',
            'requestId já utilizado.',
          );
        return {
          recordId: input.recordId,
          auditId: audit.id,
          updatedAt: p.updatedAt,
          record: p.result ?? p.after,
        };
      }
      const project = target.data()! as {
        title: string;
        description: string;
        topics: { id: string; title: string; description: string }[];
      };
      assertProjectWritable(target.data()!);
      if (input.projectId && input.projectId !== before.projectId)
        assertProjectWritable(origin.data()!);
      const updatedAt = new Date().toISOString();
      const {
        patch,
        summary,
        audit: auditData,
      } = buildRecordEditPlan(before, input, uid, project, updatedAt);
      tx.update(ref, patch);
      tx.set(audit, { ...auditData, recordedAt: serverTimestamp() });
      return {
        recordId: input.recordId,
        auditId: audit.id,
        updatedAt,
        record: summary,
      };
    });
  }
  async listTopicMerges(raw: unknown, uid: string) {
    const input = listTopicMergesInput.parse(raw),
      ref = doc(this.db, 'projects', input.projectId);
    assertProjectAccess((await getDocFromServer(ref)).data(), uid);
    const merges = collection(ref, 'topicMerges');
    const constraints: QueryConstraint[] = [
      orderBy(documentId()),
      limit(input.limit + 1),
    ];
    if (input.cursor) {
      const cursor = await getDocFromServer(doc(merges, input.cursor));
      if (!cursor.exists())
        throw new ProjectManagementError(
          'invalid-argument',
          'Cursor de auditoria não pertence ao projeto.',
        );
      constraints.push(startAfter(cursor));
    }
    const snapshot = await getDocsFromServer(query(merges, ...constraints)),
      selected = snapshot.docs.slice(0, input.limit);
    return {
      items: selected.map((d) => {
        const a = d.data();
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
      }),
      ...(snapshot.size > input.limit
        ? { nextCursor: selected.at(-1)!.id }
        : {}),
    };
  }
}
