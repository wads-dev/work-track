import { z } from 'zod';
import { normalize } from '../../../shared/text/normalize.js';
import type { Project, Topic } from './work-model.js';
export const safeId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const githubUrl = z
  .string()
  .max(300)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        url.hostname === 'github.com' &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        new RegExp(
          '^https://github[.]com/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$',
        ).test(value) &&
        !url.pathname.endsWith('/..') &&
        !url.pathname.endsWith('/.')
      );
    } catch {
      return false;
    }
  }, 'Use HTTPS github.com/owner/repo, sem credenciais/query/fragmento.');
// Public aliases are deliberately constrained to neutral labels, not client acronyms.
export const publicAlias = z
  .string()
  .regex(
    /^Projeto reservado(?: [0-9]{1,4})?$/,
    'Alias deve ser neutro: Projeto reservado, opcionalmente seguido de número.',
  );
export const metadata = {
  type: z.enum(['personal', 'work']).optional(),
  githubUrl: githubUrl.nullable().optional(),
  confidential: z.boolean().optional(),
  publicAlias: publicAlias.optional(),
};
export const updateProjectInput = z
  .object({
    projectId: safeId,
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().min(20).max(6000).optional(),
    ...metadata,
    requestId: safeId,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).some(
        (key) => !['projectId', 'requestId', 'reason'].includes(key),
      ),
    'Informe metadados para alterar.',
  );
export const mergeProjectsInput = z
  .object({
    sourceProjectId: safeId,
    targetProjectId: safeId,
    confirmed: z.boolean().default(false),
    cancel: z.boolean().optional(),
    requestId: safeId.optional(),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .refine(
    (v) => v.sourceProjectId !== v.targetProjectId,
    'Origem e destino devem ser diferentes.',
  )
  .refine(
    (v) => !v.confirmed || Boolean(v.requestId && v.reason),
    'Confirmação exige requestId e motivo.',
  );
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;
export type MergeProjectsInput = z.infer<typeof mergeProjectsInput>;
export interface MergePreview {
  mode: 'preview';
  sourceProjectId: string;
  targetProjectId: string;
  count: number;
  topicMapping: { sourceTopicId: string; targetTopicId: string }[];
  warnings: string[];
}
export interface MergeExecution {
  mode: 'execution';
  jobId: string;
  status: 'running' | 'completed' | 'cancelled';
  migratedCount: number;
  hasMore: boolean;
}
export interface ProjectManagementRepository {
  updateProject(
    input: UpdateProjectInput,
    uid: string,
  ): Promise<{ projectId: string; updatedAt: string; project: Project }>;
  mergeProjects(
    input: MergeProjectsInput,
    uid: string,
  ): Promise<MergePreview | MergeExecution>;
}
export class ProjectManagementError extends Error {
  constructor(
    readonly code:
      | 'not-found'
      | 'invalid-argument'
      | 'failed-precondition'
      | 'permission-denied',
    message: string,
  ) {
    super(message);
  }
}
export function assertProjectWritable(project: {
  mergeLock?: unknown;
  archived?: unknown;
  mergedInto?: unknown;
}) {
  if (project.mergeLock || project.archived || project.mergedInto)
    throw new ProjectManagementError(
      'failed-precondition',
      'Projeto arquivado ou em mesclagem; escolha outro projeto ou conclua o job.',
    );
}
export function mapTopics(source: Topic[], target: Topic[]) {
  const topics = [...target];
  const mapping: Record<string, string> = {};
  for (const topic of source) {
    const existing =
      topic.id === 'general'
        ? topics.find((t) => t.id === 'general')
        : topics.find((t) => normalize(t.title) === normalize(topic.title));
    if (existing && !Object.values(mapping).includes(existing.id))
      mapping[topic.id] = existing.id;
    else {
      let id = topic.id;
      for (let suffix = 1; topics.some((t) => t.id === id); suffix++)
        id = topic.id.slice(0, 110) + '_merged_' + suffix;
      topics.push({ ...topic, id });
      mapping[topic.id] = id;
    }
  }
  if (topics.length > 200)
    throw new ProjectManagementError(
      'failed-precondition',
      'Mesclagem excede 200 tópicos; concilie os tópicos antes.',
    );
  return { topics, mapping };
}
