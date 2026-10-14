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
  migratedRecordCount?: number;
  removedTopicIds?: string[];
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
function assertTopicCatalog(
  topics: Pick<Topic, 'id' | 'mergedIntoTopicId' | 'archived'>[],
): void {
  if (
    topics.length > 200 ||
    new Set(topics.map((t) => t.id)).size !== topics.length
  )
    throw new ProjectManagementError(
      'failed-precondition',
      'Catálogo de tópicos inválido.',
    );
  if (topics.some((topic) => topic.mergedIntoTopicId !== undefined))
    throw new ProjectManagementError(
      'failed-precondition',
      'Catálogo de tópicos contém aliases não suportados.',
    );
}
export function resolveTopicId(
  topics: Pick<Topic, 'id' | 'mergedIntoTopicId' | 'archived'>[],
  id: string,
): string {
  assertTopicCatalog(topics);
  const topic = topics.find((t) => t.id === id);
  if (!topic)
    throw new ProjectManagementError(
      'invalid-argument',
      'Tópico não existe no projeto.',
    );
  if (topic.archived)
    throw new ProjectManagementError(
      'failed-precondition',
      'Tópico arquivado.',
    );
  return id;
}
export function canonicalizeTopics(
  topics: Pick<Topic, 'id' | 'mergedIntoTopicId' | 'archived'>[],
  allocations: NonNullable<RegisterInput['topics']>,
) {
  assertTopicCatalog(topics);
  for (const allocation of allocations)
    resolveTopicId(topics, allocation.topicId);
  if (new Set(allocations.map((a) => a.topicId)).size !== allocations.length)
    throw new ProjectManagementError(
      'invalid-argument',
      'Tópicos duplicados. Envie uma única alocação explícita por tópico.',
    );
  return allocations.map((allocation) => ({ ...allocation }));
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
    if (topic.id === 'general' || topic.archived)
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
      'Na execução, referências e snapshots dos registros são migrados para o destino e os tópicos de origem são removidos do projeto; fatos e auditoria são preservados. Limites: 2000 registros físicos no contexto e 100 registros migrados atomicamente.',
      'Impacto em registros não foi contado; esta prévia não é uma contagem completa.',
      'Não há desfazer nesta versão; auditoria preserva estados anteriores e posteriores.',
    ],
  };
}
