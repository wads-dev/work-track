import { isDeletedRecord } from './record-lifecycle.js';
import { z } from 'zod';
import { canonicalizeTopics } from './topic-management.js';
import { registerInput } from './work-model.js';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const updateRecordInput = z
  .object({
    recordId: id,
    requestId: id.optional(),
    endedAt: z.iso.datetime({ offset: true }).nullable().optional(),
    projectId: id.optional(),
    topics: z
      .array(
        z
          .object({
            topicId: id,
            percentage: z.number().positive().max(100).optional(),
            durationMinutes: z.number().positive().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30)
      .optional(),
    reason: z.string().trim().min(1).max(1000),
    expectedUpdatedAt: z.string().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.endedAt !== undefined ||
      value.projectId !== undefined ||
      value.topics !== undefined,
    'Informe uma alteração.',
  );
export type UpdateRecordInput = z.infer<typeof updateRecordInput>;
export interface EditableRecord {
  id: string;
  uid: string;
  projectId: string;
  startedAt: string;
  endedAt?: string;
  topics: { topicId: string; percentage?: number; durationMinutes?: number }[];
}
export interface UpdateRecordResult {
  recordId: string;
  updatedAt: string;
  auditId: string;
  record: EditableRecord;
}
export interface OpenRecord {
  id: string;
  projectId: string;
  startedAt: string;
}
export interface RecordEditingRepository {
  updateRecord(
    input: UpdateRecordInput,
    uid: string,
  ): Promise<UpdateRecordResult>;
  listOpenRecords(
    uid: string,
    limit: number,
  ): Promise<{ records: OpenRecord[]; partial: boolean }>;
}
export class RecordEditError extends Error {
  constructor(
    readonly code:
      'not-found' | 'permission-denied' | 'invalid-argument' | 'aborted',
    message: string,
  ) {
    super(message);
  }
}
export function applyRecordPatch(
  existing: Record<string, unknown>,
  input: UpdateRecordInput,
  uid: string,
  project: {
    topics: { id: string; mergedIntoTopicId?: string; archived?: boolean }[];
  },
): Record<string, unknown> {
  if (isDeletedRecord(existing))
    throw new RecordEditError(
      'not-found',
      'Registro removido; edição não permitida.',
    );
  if (existing.uid !== uid)
    throw new RecordEditError(
      'permission-denied',
      'Somente o dono pode editar o registro.',
    );
  if (
    input.expectedUpdatedAt !== undefined &&
    (existing.updatedAt ?? null) !== input.expectedUpdatedAt
  )
    throw new RecordEditError(
      'aborted',
      'Registro alterado. Recarregue antes de salvar.',
    );
  const after = { ...existing };
  if (input.endedAt === null) delete after.endedAt;
  else if (input.endedAt !== undefined) after.endedAt = input.endedAt;
  if (input.projectId !== undefined) after.projectId = input.projectId;
  if (input.topics !== undefined)
    after.topics = canonicalizeTopics(project.topics, input.topics);
  const valid = registerInput.safeParse(after);
  if (!valid.success)
    throw new RecordEditError(
      'invalid-argument',
      valid.error.issues[0]?.message ?? 'Registro inválido.',
    );
  for (const topic of valid.data.topics ?? [])
    if (!project.topics.some((known) => known.id === topic.topicId))
      throw new RecordEditError(
        'invalid-argument',
        'Tópico não existe no projeto escolhido.',
      );
  return after;
}
export function recordSummary(
  record: Record<string, unknown>,
  id: string,
): EditableRecord {
  const value = registerInput.parse(record);
  return {
    id,
    uid: record.uid as string,
    projectId: value.projectId,
    startedAt: value.startedAt,
    ...(value.endedAt ? { endedAt: value.endedAt } : {}),
    topics: value.topics ?? [],
  };
}
