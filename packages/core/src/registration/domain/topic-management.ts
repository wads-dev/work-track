import { z } from 'zod';
import {
  safeId,
  assertProjectWritable,
  ProjectManagementError,
} from './project-management.js';
import type { Project, Topic, RegisterInput } from './work-model.js';
export const mergeTopicsInput = z
  .object({
    projectId: safeId,
    sourceTopicIds: z.array(safeId).min(1).max(30),
    targetTopicId: safeId,
    confirmed: z.boolean().default(false),
    requestId: safeId.optional(),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.sourceTopicIds).size === v.sourceTopicIds.length &&
      !v.sourceTopicIds.includes(v.targetTopicId),
    'Origens únicas e diferentes do destino.',
  )
  .refine(
    (v) => !v.confirmed || Boolean(v.requestId && v.reason),
    'Confirmação exige requestId e motivo.',
  );
export const listTopicMergesInput = z
  .object({
    projectId: safeId,
    limit: z.number().int().min(1).max(100).default(20),
    cursor: safeId.optional(),
  })
  .strict();
export type MergeTopicsInput = z.infer<typeof mergeTopicsInput>;
export type ListTopicMergesInput = z.infer<typeof listTopicMergesInput>;
export interface TopicMergePreview {
  mode: 'preview';
  projectId: string;
  sourceTopics: Topic[];
  targetTopic: Topic;
  warnings: string[];
  recordImpact: { scope: 'not-scanned'; count: null };
  preservesRecords: true;
}
export interface TopicMergeExecution {
  mode: 'execution';
  status: 'completed';
  projectId: string;
  auditId: string;
  updatedAt: string;
  sourceTopicIds: string[];
  targetTopicId: string;
  preservesRecords: true;
}
export interface TopicMergeAudit {
  id: string;
  projectId: string;
  authorUid: string;
  reason: string;
  recordedAt: string;
  before: Topic[];
  after: Topic[];
  sourceTopicIds: string[];
  targetTopicId: string;
}
export interface TopicManagementRepository {
  mergeTopics(
    input: MergeTopicsInput,
    uid: string,
  ): Promise<TopicMergePreview | TopicMergeExecution>;
  listTopicMerges(
    input: ListTopicMergesInput,
    uid: string,
  ): Promise<{ items: TopicMergeAudit[]; nextCursor?: string }>;
}
export function resolveTopicId(
  topics: Pick<Topic, 'id' | 'mergedIntoTopicId' | 'archived'>[],
  id: string,
): string {
  if (
    topics.length > 200 ||
    new Set(topics.map((t) => t.id)).size !== topics.length
  )
    throw new ProjectManagementError(
      'failed-precondition',
      'Catálogo de tópicos inválido.',
    );
  const visited = new Set<string>();
  let current = id;
  while (!visited.has(current) && visited.size < 200) {
    visited.add(current);
    const topic = topics.find((t) => t.id === current);
    if (!topic)
      throw new ProjectManagementError(
        'invalid-argument',
        'Tópico ou destino não existe no projeto.',
      );
    if (!topic.mergedIntoTopicId) {
      if (topic.archived)
        throw new ProjectManagementError(
          'failed-precondition',
          'Tópico arquivado sem destino.',
        );
      return current;
    }
    current = topic.mergedIntoTopicId;
  }
  throw new ProjectManagementError(
    'failed-precondition',
    'Ciclo de aliases de tópicos.',
  );
}
export function canonicalizeTopics(
  topics: Pick<Topic, 'id' | 'mergedIntoTopicId' | 'archived'>[],
  allocations: NonNullable<RegisterInput['topics']>,
) {
  const mapped = allocations.map((a) => ({
    ...a,
    topicId: resolveTopicId(topics, a.topicId),
  }));
  // Keep explicit allocations; collapsing two IDs must never invent or lose time.
  if (new Set(mapped.map((a) => a.topicId)).size !== mapped.length)
    throw new ProjectManagementError(
      'invalid-argument',
      'Tópicos convergem para o mesmo destino. Envie uma única alocação explícita para o tópico canônico.',
    );
  return mapped;
}
export function previewTopicMerge(
  project: Project,
  input: MergeTopicsInput,
): TopicMergePreview {
  assertProjectWritable(project);
  for (const topic of project.topics) resolveTopicId(project.topics, topic.id);
  const target = project.topics.find((t) => t.id === input.targetTopicId);
  if (!target)
    throw new ProjectManagementError(
      'not-found',
      'Tópico destino não existe neste projeto.',
    );
  if (target.archived || target.mergedIntoTopicId)
    throw new ProjectManagementError(
      'failed-precondition',
      'Destino deve ser tópico canônico ativo.',
    );
  const sources = input.sourceTopicIds.map((id) => {
    const topic = project.topics.find((t) => t.id === id);
    if (!topic)
      throw new ProjectManagementError(
        'not-found',
        'Tópico origem não existe neste projeto.',
      );
    if (topic.id === 'general' || topic.archived || topic.mergedIntoTopicId)
      throw new ProjectManagementError(
        'failed-precondition',
        'Origem Geral, arquivada ou já mesclada não permitida.',
      );
    return topic;
  });
  if (
    sources.some((t) => t.id === target.id) ||
    new Set(input.sourceTopicIds).size !== sources.length
  )
    throw new ProjectManagementError(
      'invalid-argument',
      'Origens únicas e diferentes do destino.',
    );
  return {
    mode: 'preview',
    projectId: input.projectId,
    sourceTopics: sources,
    targetTopic: target,
    preservesRecords: true,
    recordImpact: { scope: 'not-scanned', count: null },
    warnings: [
      'Registros e snapshots históricos permanecem inalterados. Relatórios resolvem aliases no projeto.',
      'Impacto em registros não foi contado; esta prévia não é uma contagem completa.',
      'Não há desfazer nesta versão; auditoria preserva estados anteriores e posteriores.',
    ],
  };
}
