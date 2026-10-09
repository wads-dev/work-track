import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  assertProjectWritable,
  assertArchiveAllowed,
  type ArchiveProjectInput,
  mapTopics,
  ProjectManagementError,
  type ProjectManagementRepository,
  type UpdateProjectInput,
  type MergeProjectsInput,
} from '../domain/project-management.js';
import type { Project } from '../domain/work-model.js';
type ManagedProject = Project & {
  mergeLock?: string;
  archived?: boolean;
  mergedInto?: string;
  confidential?: boolean;
  publicAlias?: string;
};
interface Job {
  authorUid: string;
  sourceProjectId: string;
  targetProjectId: string;
  reason: string;
  status: 'running' | 'completed' | 'cancelled';
  migratedCount: number;
  mapping: Record<string, string>;
  topics: Project['topics'];
}
export class FirestoreProjectManagementRepository implements ProjectManagementRepository {
  constructor(private readonly db: Firestore) {}
  async archiveProject(input: ArchiveProjectInput, uid: string) {
    const ref = this.db.collection('projects').doc(input.projectId),
      audit = ref.collection('audit').doc('archive_' + input.requestId);
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref),
        prior = await tx.get(audit);
      if (!snapshot.exists)
        throw new ProjectManagementError(
          'not-found',
          'Projeto não encontrado.',
        );
      if (prior.exists) {
        const previous = prior.data() as {
          request: string;
          authorUid: string;
          result: { projectId: string; archived: boolean; updatedAt: string };
        };
        if (
          previous.request !== JSON.stringify(input) ||
          previous.authorUid !== uid
        )
          throw new ProjectManagementError(
            'invalid-argument',
            'requestId já utilizado.',
          );
        return previous.result;
      }
      const before = snapshot.data() as ManagedProject;
      assertArchiveAllowed(before, input.archived);
      const updatedAt = new Date().toISOString(),
        result = {
          projectId: input.projectId,
          archived: input.archived,
          updatedAt,
        };
      tx.update(ref, { archived: input.archived, updatedAt, updatedBy: uid });
      tx.create(audit, {
        authorUid: uid,
        reason: input.reason,
        request: JSON.stringify(input),
        action: 'archive',
        before: { archived: before.archived ?? false },
        after: { archived: input.archived },
        recordedAt: FieldValue.serverTimestamp(),
        result,
      });
      return result;
    });
  }
  async updateProject(input: UpdateProjectInput, uid: string) {
    const ref = this.db.collection('projects').doc(input.projectId),
      audit = ref.collection('audit').doc(input.requestId);
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref),
        prior = await tx.get(audit);
      if (!snapshot.exists)
        throw new ProjectManagementError(
          'not-found',
          'Projeto não encontrado.',
        );
      if (prior.exists) {
        const p = prior.data() as {
          request: string;
          result: { projectId: string; updatedAt: string; project: Project };
        };
        if (
          p.request !== JSON.stringify(input) ||
          prior.data()?.authorUid !== uid
        )
          throw new ProjectManagementError(
            'invalid-argument',
            'requestId já utilizado.',
          );
        return p.result;
      }
      const before = snapshot.data() as ManagedProject;
      assertProjectWritable(before);
      const { projectId, requestId, reason, ...metadata } = input;
      void requestId;
      const patch: Record<string, unknown> = {
        ...metadata,
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      };
      if (metadata.githubUrl === null) patch.githubUrl = FieldValue.delete();
      if (
        metadata.confidential === true &&
        !metadata.publicAlias &&
        !before.publicAlias
      )
        patch.publicAlias = 'Projeto reservado';
      const after = {
        ...before,
        ...metadata,
        ...(patch.publicAlias ? { publicAlias: patch.publicAlias } : {}),
        updatedAt: patch.updatedAt,
      } as Project;
      if (metadata.githubUrl === null)
        delete (after as Project & { githubUrl?: string | null }).githubUrl;
      const result = {
        projectId,
        updatedAt: patch.updatedAt as string,
        project: after,
      };
      tx.update(ref, patch);
      tx.create(audit, {
        authorUid: uid,
        reason,
        request: JSON.stringify(input),
        before,
        after,
        recordedAt: FieldValue.serverTimestamp(),
        result,
      });
      return result;
    });
  }
  async mergeProjects(input: MergeProjectsInput, uid: string) {
    const sourceRef = this.db.collection('projects').doc(input.sourceProjectId),
      targetRef = this.db.collection('projects').doc(input.targetProjectId);
    const query = this.db
      .collectionGroup('records')
      .where('projectId', '==', input.sourceProjectId);
    if (!input.confirmed) {
      const [a, b, count] = await Promise.all([
        sourceRef.get(),
        targetRef.get(),
        query.count().get(),
      ]);
      if (!a.exists || !b.exists)
        throw new ProjectManagementError(
          'not-found',
          'Projeto não encontrado.',
        );
      const source = a.data() as ManagedProject,
        target = b.data() as ManagedProject;
      assertProjectWritable(source);
      assertProjectWritable(target);
      const { mapping } = mapTopics(source.topics, target.topics);
      return {
        mode: 'preview' as const,
        sourceProjectId: input.sourceProjectId,
        targetProjectId: input.targetProjectId,
        count: count.data().count,
        topicMapping: Object.entries(mapping).map(
          ([sourceTopicId, targetTopicId]) => ({
            sourceTopicId,
            targetTopicId,
          }),
        ),
        warnings: [
          'Preview não modifica dados. Execução exige confirmação explícita e bloqueia ambos os projetos até concluir.',
          'Conteúdo confidencial da origem torna o destino confidencial; não há alteração de permissões.',
        ],
      };
    }
    const jobId = createHash('sha256')
        .update(uid + ':' + input.requestId)
        .digest('hex'),
      jobRef = this.db.collection('project_merge_jobs').doc(jobId);
    if (input.cancel) {
      return this.db.runTransaction(async (tx) => {
        const snapshot = await tx.get(jobRef),
          a = await tx.get(sourceRef),
          b = await tx.get(targetRef);
        if (!snapshot.exists)
          throw new ProjectManagementError('not-found', 'Job não encontrado.');
        const job = snapshot.data() as Job;
        if (
          job.authorUid !== uid ||
          job.sourceProjectId !== input.sourceProjectId ||
          job.targetProjectId !== input.targetProjectId
        )
          throw new ProjectManagementError(
            'permission-denied',
            'Job pertence a outra intenção.',
          );
        if (job.status === 'completed')
          throw new ProjectManagementError(
            'failed-precondition',
            'Job já concluído.',
          );
        if (job.status === 'running') {
          if (a.data()?.mergeLock !== jobId || b.data()?.mergeLock !== jobId)
            throw new ProjectManagementError(
              'failed-precondition',
              'Locks inconsistentes.',
            );
          tx.update(sourceRef, { mergeLock: FieldValue.delete() });
          tx.update(targetRef, { mergeLock: FieldValue.delete() });
          tx.update(jobRef, {
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelReason: input.reason,
          });
        }
        return {
          mode: 'execution' as const,
          jobId,
          status: 'cancelled' as const,
          migratedCount: job.migratedCount,
          hasMore: false,
        };
      });
    }
    await this.db.runTransaction(async (tx) => {
      const job = await tx.get(jobRef),
        a = await tx.get(sourceRef),
        b = await tx.get(targetRef);
      if (job.exists) {
        const prior = job.data() as Job;
        if (
          prior.sourceProjectId !== input.sourceProjectId ||
          prior.targetProjectId !== input.targetProjectId ||
          prior.reason !== input.reason
        )
          throw new ProjectManagementError(
            'invalid-argument',
            'requestId já usado para outra mesclagem.',
          );
        return;
      }
      if (!a.exists || !b.exists)
        throw new ProjectManagementError(
          'not-found',
          'Projeto não encontrado.',
        );
      const source = a.data() as ManagedProject,
        target = b.data() as ManagedProject;
      assertProjectWritable(source);
      assertProjectWritable(target);
      const { mapping, topics } = mapTopics(source.topics, target.topics);
      tx.create(jobRef, {
        authorUid: uid,
        sourceProjectId: input.sourceProjectId,
        targetProjectId: input.targetProjectId,
        reason: input.reason,
        status: 'running',
        migratedCount: 0,
        mapping,
        topics,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(sourceRef, { mergeLock: jobId });
      tx.update(targetRef, {
        mergeLock: jobId,
        topics,
        confidential: Boolean(source.confidential || target.confidential),
        ...(source.confidential || target.confidential
          ? { publicAlias: target.publicAlias || 'Projeto reservado' }
          : {}),
      });
    });
    return this.db.runTransaction(async (tx) => {
      const jobSnapshot = await tx.get(jobRef),
        a = await tx.get(sourceRef),
        b = await tx.get(targetRef);
      const job = jobSnapshot.data() as Job;
      if (job.status === 'cancelled')
        throw new ProjectManagementError(
          'failed-precondition',
          'Job cancelado. Lotes já migrados foram preservados; concilie ou crie nova intenção explícita.',
        );
      if (job.status === 'completed')
        return {
          mode: 'execution' as const,
          jobId,
          status: 'completed' as const,
          migratedCount: job.migratedCount,
          hasMore: false,
        };
      if (a.data()?.mergeLock !== jobId || b.data()?.mergeLock !== jobId)
        throw new ProjectManagementError(
          'failed-precondition',
          'Locks da mesclagem inconsistentes.',
        );
      const page = await tx.get(query.limit(101));
      const docs = page.docs.slice(0, 100);
      const target = b.data() as ManagedProject;
      const changes = docs.map((doc) => {
        const data = doc.data(),
          parts = doc.ref.path.split('/');
        if (
          parts.length !== 4 ||
          parts[0] !== 'users' ||
          parts[2] !== 'records' ||
          parts[1] !== data.uid
        )
          throw new ProjectManagementError(
            'failed-precondition',
            'Registro fora do caminho canônico.',
          );
        const topics = (data.topics ?? [{ topicId: 'general' }]) as {
          topicId: string;
          percentage?: number;
          durationMinutes?: number;
        }[];
        const mapped = topics.map((topic) => {
          if (!job.mapping[topic.topicId])
            throw new ProjectManagementError(
              'failed-precondition',
              'Tópico de registro não mapeado.',
            );
          return { ...topic, topicId: job.mapping[topic.topicId]! };
        });
        // Keep duplicate topic associations distinct: never silently merge allocations.
        if (new Set(mapped.map((t) => t.topicId)).size !== mapped.length)
          throw new ProjectManagementError(
            'failed-precondition',
            'Tópicos colidem após mapeamento; concilie antes de retomar.',
          );
        return { doc, data, mapped };
      });
      for (const { doc, data, mapped } of changes) {
        tx.update(doc.ref, {
          projectId: input.targetProjectId,
          topics: mapped,
          projectSnapshot: {
            title: target.title,
            description: target.description,
          },
          topicSnapshots: mapped.map((t) =>
            target.topics.find((topic) => topic.id === t.topicId),
          ),
          updatedAt: new Date().toISOString(),
          updatedBy: uid,
        });
        tx.create(doc.ref.collection('audit').doc('merge_' + jobId), {
          authorUid: uid,
          reason: job.reason,
          updatedAt: new Date().toISOString(),
          recordedAt: FieldValue.serverTimestamp(),
          migrationJobId: jobId,
          before: {
            projectId: data.projectId as string,
            topics: (data.topics ?? []) as unknown[],
          },
          after: { projectId: input.targetProjectId, topics: mapped },
        });
      }
      const completed = page.docs.length <= 100,
        migratedCount = job.migratedCount + docs.length;
      tx.update(jobRef, {
        migratedCount,
        status: completed ? 'completed' : 'running',
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (completed) {
        tx.update(sourceRef, {
          mergeLock: FieldValue.delete(),
          archived: true,
          mergedInto: input.targetProjectId,
        });
        tx.update(targetRef, { mergeLock: FieldValue.delete() });
      }
      return {
        mode: 'execution' as const,
        jobId,
        status: completed ? ('completed' as const) : ('running' as const),
        migratedCount,
        hasMore: !completed,
      };
    });
  }
}
