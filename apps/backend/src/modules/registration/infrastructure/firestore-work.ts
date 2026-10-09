import { createHash } from 'node:crypto';
import { assertProjectWritable } from '../domain/project-management.js';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type {
  Project,
  Topic,
  WorkRepository,
  RegisterInput,
} from '../domain/work-model.js';
import {
  projectInput,
  topicInput,
  registerInput,
} from '../domain/work-model.js';
import { normalize } from '../../../shared/text/normalize.js';
export class FirestoreWorkRepository implements WorkRepository {
  constructor(private readonly db: Firestore) {}
  async listProjects(): Promise<Project[]> {
    const snapshot = await this.db.collection('projects').get();
    return snapshot.docs.map((doc) => doc.data() as Project);
  }
  async createProject(
    raw: Parameters<WorkRepository['createProject']>[0],
    uid: string,
  ): Promise<Project> {
    const input = projectInput.parse(raw);
    const key = createHash('sha256')
      .update(normalize(input.title))
      .digest('hex');
    const ref = this.db.collection('projects').doc(key);
    return this.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        const project = existing.data() as Project;
        assertProjectWritable(project);
        return project;
      }
      const project: Project = {
        ...input,
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
  async createTopic(
    raw: { projectId: string; title: string; description: string },
    uid: string,
  ): Promise<Topic> {
    const input = topicInput.parse(raw);
    const ref = this.db.collection('projects').doc(input.projectId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists)
        throw new Error(
          'Projeto não existe. Use search_projects ou create_project.',
        );
      const project = doc.data() as Project;
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
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');
    return this.db.runTransaction(async (tx) => {
      const [existing, projectDoc] = await Promise.all([
        tx.get(ref),
        tx.get(projectRef),
      ]);
      if (existing.exists) {
        const data = existing.data() as Record<string, unknown>;
        if (data.fingerprint !== fingerprint)
          throw new Error('requestId já utilizado com dados diferentes.');
        return { ...data, duplicate: true };
      }
      if (!projectDoc.exists)
        throw new Error(
          'Projeto não existe. Pesquise ou crie antes de registrar.',
        );
      const project = projectDoc.data() as Project;
      assertProjectWritable(project);
      const topics = input.topics?.length
        ? input.topics
        : [{ topicId: 'general' }];
      for (const topic of topics)
        if (!project.topics.some((known) => known.id === topic.topicId))
          throw new Error(
            'Tópico não existe neste projeto. Use create_topic primeiro.',
          );
      const record = JSON.parse(
        JSON.stringify({
          ...input,
          topics,
          id: key,
          uid,
          receivedAt: new Date().toISOString(),
          fingerprint,
          projectSnapshot: {
            title: project.title,
            description: project.description,
          },
          topicSnapshots: topics.map((topic) =>
            project.topics.find((known) => known.id === topic.topicId),
          ),
        }),
      ) as Record<string, unknown>;
      tx.create(ref, { ...record, recordedAt: FieldValue.serverTimestamp() });
      return { ...record, duplicate: false };
    });
  }
}
