import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { createHash } from 'node:crypto';
import {
  compactRecentRecords,
  recentRecordsInput,
  type RecentRecordsInput,
} from '@work-track/core/registration/domain/recent-records';
import {
  assertProjectAccess,
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import { ProjectManagementError } from '@work-track/core/registration/domain/project-management';
import { canonicalizeTopics } from '@work-track/core/registration/domain/topic-management';
import {
  selectPrevious,
  type PreviousRecord,
} from '@work-track/core/registration/domain/close-previous';
import { assertProjectWritable } from '@work-track/core/registration/domain/project-management';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type {
  Project,
  Topic,
  WorkRepository,
  RegisterInput,
} from '@work-track/core/registration/domain/work-model';
import {
  projectInput,
  topicInput,
  updateTopicInput,
  registerInput,
} from '@work-track/core/registration/domain/work-model';
import { normalize } from '@work-track/core/shared/text/normalize';
export class FirestoreWorkRepository implements WorkRepository {
  constructor(private readonly db: Firestore) {}
  async listRecentRecords(raw: RecentRecordsInput, uid: string) {
    const input = recentRecordsInput.parse(raw);
    // Legacy open records may omit endedAt; bounded scan fails explicitly, never asserts absence from partial history.
    const snapshot = await this.db
      .collection('users')
      .doc(uid)
      .collection('records')
      .limit(2001)
      .get();
    if (snapshot.docs.length > 2000)
      throw new ProjectManagementError(
        'resource-exhausted',
        'Histórico excede orçamento de leitura; não é possível afirmar ausência de tracking.',
      );
    const projects = await this.listProjects(uid);
    return compactRecentRecords(
      snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
      projects,
      uid,
      input,
    );
  }
  async listProjects(uid: string): Promise<Project[]> {
    const snapshot = await this.db.collection('projects').limit(1001).get();
    if (snapshot.docs.length > 1000)
      throw new ProjectManagementError(
        'resource-exhausted',
        'Catálogo excede o limite seguro de consulta.',
      );
    return snapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as Project)
      .filter((p) => canAccessProject(p, uid));
  }
  async createProject(
    raw: Parameters<WorkRepository['createProject']>[0],
    uid: string,
  ): Promise<Project> {
    const input = projectInput.parse(raw);
    const key = createHash('sha256')
      .update(
        input.type === 'personal'
          ? 'personal:' + uid + ':' + normalize(input.title)
          : normalize(input.title),
      )
      .digest('hex');
    const ref = this.db.collection('projects').doc(key);
    return this.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        const project = existing.data() as Project;
        assertProjectAccess(project, uid);
        if (effectiveProjectType(project) !== input.type)
          throw new ProjectManagementError(
            'failed-precondition',
            'Escopo existente não pode ser alterado.',
          );
        assertProjectAccess(project, uid);
        assertProjectWritable(project);
        return project;
      }
      const project: Project = {
        ...input,
        archived: false,
        confidential: input.confidential ?? false,
        publicAlias: input.publicAlias ?? 'Projeto reservado',
        id: key,
        topics: [
          {
            id: 'general',
            title: 'Geral',
            description: 'Atividade geral ou tópico ainda não identificado.',
          },
        ],
        createdBy: uid,
        createdAt: new Date().toISOString(),
      };
      tx.create(ref, { ...project, recordedAt: FieldValue.serverTimestamp() });
      tx.create(ref.collection('audit').doc('created'), {
        authorUid: uid,
        action: 'create',
        after: project,
        recordedAt: FieldValue.serverTimestamp(),
      });
      return project;
    });
  }
  async updateTopic(
    raw: Parameters<NonNullable<WorkRepository['updateTopic']>>[0],
    uid: string,
  ): Promise<Topic> {
    const input = updateTopicInput.parse(raw);
    const ref = this.db.collection('projects').doc(input.projectId);
    const audit = ref.collection('audit').doc(
      'topic_' +
        createHash('sha256')
          .update(uid + ':' + input.requestId)
          .digest('hex'),
    );
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      assertProjectAccess(snapshot.data(), uid);
      const project = snapshot.data() as Project;
      assertProjectWritable(project);
      const previous = await tx.get(audit);
      if (previous.exists) {
        const data = previous.data()!;
        if (data.request !== JSON.stringify(input))
          throw new Error('requestId já usado.');
        return data.after as Topic;
      }
      const before = project.topics.find((t) => t.id === input.topicId);
      if (!before || before.archived || before.mergedIntoTopicId)
        throw new Error('Tópico ativo não encontrado.');
      const after = {
        ...before,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.githubUrl !== undefined
          ? { githubUrl: input.githubUrl }
          : {}),
      };
      if (
        project.topics.some(
          (t) =>
            t.id !== after.id &&
            !t.archived &&
            normalize(t.title) === normalize(after.title),
        )
      )
        throw new Error('Nome de tópico já utilizado.');
      tx.update(ref, {
        topics: project.topics.map((t) => (t.id === after.id ? after : t)),
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(audit, {
        authorUid: uid,
        request: JSON.stringify(input),
        reason: input.reason,
        before,
        after,
        recordedAt: FieldValue.serverTimestamp(),
      });
      return after;
    });
  }
  async createTopic(
    raw: { projectId: string; title: string; description: string },
    uid: string,
  ): Promise<Topic> {
    const input = topicInput.parse(raw);
    const ref = this.db.collection('projects').doc(input.projectId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      assertProjectAccess(doc.data(), uid);
      const project = doc.data() as Project;
      assertProjectAccess(project, uid);
      assertProjectWritable(project);
      const existing = project.topics.find(
        (topic) => normalize(topic.title) === normalize(input.title),
      );
      if (existing) return existing;
      if (project.topics.length >= 200)
        throw new Error('Limite de 200 tópicos por projeto.');
      const topic = {
        id: createHash('sha256')
          .update(normalize(input.title))
          .digest('hex')
          .slice(0, 32),
        title: input.title,
        description: input.description,
        ...(input.githubUrl !== undefined
          ? { githubUrl: input.githubUrl }
          : {}),
      };
      tx.update(ref, {
        topics: [...project.topics, topic],
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return topic;
    });
  }
  async register(
    raw: RegisterInput,
    uid: string,
  ): Promise<Record<string, unknown>> {
    const input = registerInput.parse(raw);
    const key = createHash('sha256').update(input.requestId).digest('hex');
    const ref = this.db
      .collection('users')
      .doc(uid)
      .collection('records')
      .doc(key);
    const projectRef = this.db.collection('projects').doc(input.projectId);
    const fingerprintInput = { ...input };
    if (fingerprintInput.closePrevious === false)
      delete fingerprintInput.closePrevious;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(fingerprintInput))
      .digest('hex');
    return this.db.runTransaction(async (tx) => {
      const [existing, projectDoc] = await Promise.all([
        tx.get(ref),
        tx.get(projectRef),
      ]);
      assertProjectAccess(projectDoc.data(), uid);
      if (existing.exists) {
        const data = existing.data() as Record<string, unknown>;
        if (isDeletedRecord(data))
          throw new Error(
            'Registro removido; requestId preservado, nenhuma atividade criada ou reaberta.',
          );
        if (data.fingerprint !== fingerprint)
          throw new Error('requestId já utilizado com dados diferentes.');
        return { ...data, duplicate: true };
      }
      if (!projectDoc.exists)
        throw new Error(
          'Projeto não existe. Pesquise ou crie antes de registrar.',
        );
      const project = projectDoc.data() as Project;
      assertProjectAccess(project, uid);
      assertProjectWritable(project);
      const suppliedTopics = input.topics?.length
        ? input.topics
        : [{ topicId: 'general' }];
      const topics = canonicalizeTopics(project.topics, suppliedTopics);
      for (const topic of topics)
        if (!project.topics.some((known) => known.id === topic.topicId))
          throw new Error(
            'Tópico não existe neste projeto. Use create_topic primeiro.',
          );
      let previous:
        { ref: typeof ref; data: Record<string, unknown> } | undefined;
      if (input.closePrevious) {
        const collection = this.db
          .collection('users')
          .doc(uid)
          .collection('records');
        if (input.closedPreviousRecordId) {
          const candidateRef = collection.doc(input.closedPreviousRecordId),
            candidate = await tx.get(candidateRef);
          if (!candidate.exists)
            throw new Error('Anterior explícito não encontrado.');
          const data = candidate.data() as Record<string, unknown>;
          selectPrevious(
            [{ ...data, id: candidate.id } as unknown as PreviousRecord],
            uid,
            input.projectId,
            input.startedAt,
            input.closedPreviousRecordId,
          );
          previous = { ref: candidateRef, data };
        } else {
          const snapshot = await tx.get(collection);
          if (
            snapshot.docs.filter((doc) => !isDeletedRecord(doc.data())).length >
            2000
          )
            throw new Error(
              'Contexto de anteriores excede limite; informe closedPreviousRecordId explícito.',
            );
          const candidates = snapshot.docs.map(
            (doc) => ({ ...doc.data(), id: doc.id }) as PreviousRecord,
          );
          const selected = selectPrevious(
            candidates,
            uid,
            input.projectId,
            input.startedAt,
          );
          if (selected) {
            const doc = snapshot.docs.find((doc) => doc.id === selected.id)!;
            previous = { ref: doc.ref, data: doc.data() };
          }
        }
      }
      const record = JSON.parse(
        JSON.stringify({
          ...input,
          topics,
          ...(topics.some((t, i) => t.topicId !== suppliedTopics[i]?.topicId)
            ? {
                topicResolution: suppliedTopics.map((t, i) => ({
                  sourceTopicId: t.topicId,
                  targetTopicId: topics[i]!.topicId,
                })),
                warnings: [
                  'Tópicos unificados foram resolvidos para os destinos canônicos.',
                ],
              }
            : {}),
          id: key,
          uid,
          receivedAt: new Date().toISOString(),
          fingerprint,
          ...(previous ? { closedPreviousRecordId: previous.ref.id } : {}),
          projectSnapshot: {
            title: project.title,
            description: project.description,
          },
          topicSnapshots: topics.map((topic) =>
            project.topics.find((known) => known.id === topic.topicId),
          ),
        }),
      ) as Record<string, unknown>;
      if (previous) {
        const updatedAt = new Date().toISOString();
        tx.update(previous.ref, {
          endedAt: input.startedAt,
          updatedAt,
          updatedBy: uid,
        });
        tx.create(previous.ref.collection('audit').doc('close_' + key), {
          authorUid: uid,
          updatedAt,
          reason: input.closePreviousReason,
          action: 'confirmed-switch',
          nextRecordId: key,
          before: {
            startedAt: previous.data.startedAt as string,
            endedAt: null,
            projectId: input.projectId,
          },
          after: {
            startedAt: previous.data.startedAt as string,
            endedAt: input.startedAt,
            projectId: input.projectId,
          },
          recordedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.create(ref, {
        ...record,
        endedAt: record.endedAt ?? null,
        recordedAt: FieldValue.serverTimestamp(),
      });
      return {
        ...record,
        duplicate: false,
        ...(input.closePrevious && !previous
          ? {
              warnings: [
                'Nenhum anterior aberto elegível encontrado; nenhum registro anterior foi encerrado.',
              ],
            }
          : {}),
      };
    });
  }
}
