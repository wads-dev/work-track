import { isDeletedRecord } from '../../registration/domain/record-lifecycle.js';
import { z } from 'zod';
import {
  safeId,
  assertProjectWritable,
} from '../../registration/domain/project-management.js';
import { assertProjectAccess } from '../../registration/domain/project-access.js';
import {
  registerInput,
  type Project,
} from '../../registration/domain/work-model.js';
export const pauseInput = z
  .object({
    resumedAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().finite().positive().lt(1440),
    recordId: safeId.optional(),
    requestId: safeId,
    reason: z.string().min(3).max(6000),
    originalUtterance: z.string().min(1).max(12000),
  })
  .strict();
export type PauseInput = z.infer<typeof pauseInput>;
export class PauseError extends Error {
  constructor(
    readonly code:
      | 'invalid-argument'
      | 'not-found'
      | 'failed-precondition'
      | 'resource-exhausted'
      | 'aborted',
    message: string,
    readonly candidates?: { recordId: string; startedAt: string }[],
  ) {
    super(message);
  }
}
export interface PauseResult {
  sourceRecordId: string;
  successorRecordId: string;
  pausedAt: string;
  resumedAt: string;
  durationMinutes: number;
  auditId: string;
}
export interface PauseRepository {
  registerPause(
    input: PauseInput,
    uid: string,
    now?: number,
  ): Promise<PauseResult>;
}
export function validateSpeech(input: PauseInput, now: number) {
  const speech = Date.parse(input.resumedAt);
  if (!Number.isFinite(now) || !Number.isFinite(speech))
    throw new PauseError(
      'invalid-argument',
      'Momento da fala e relógio devem ser válidos.',
    );
  if (speech > now || now - speech >= 86400000)
    throw new PauseError(
      'invalid-argument',
      'Retomada deve ser passada ou atual e menor que24h; use o momento da fala, não do recebimento.',
    );
  return speech;
}
export function validateSource(
  source: Record<string, unknown>,
  project: Project | undefined,
  input: PauseInput,
  uid: string,
  now: number,
) {
  if (isDeletedRecord(source))
    throw new PauseError(
      'failed-precondition',
      'Registro removido; pausa não permitida.',
    );
  const speech = validateSpeech(input, now);
  if (source.projectId !== project?.id)
    throw new PauseError(
      'failed-precondition',
      'Projeto do registro não corresponde ao contexto.',
    );
  assertProjectAccess(project, uid);
  assertProjectWritable(project);
  if (
    !Array.isArray(project.topics) ||
    project.topics.some(
      (t) => !t || typeof t !== 'object' || typeof t.id !== 'string',
    )
  )
    throw new PauseError(
      'failed-precondition',
      'Contexto de projeto/tópicos inválido; nenhuma alteração.',
    );
  if (source.uid !== uid)
    throw new PauseError('not-found', 'Registro não encontrado.');
  if (
    typeof source.startedAt !== 'string' ||
    (source.endedAt !== undefined && source.endedAt !== null)
  )
    throw new PauseError(
      'failed-precondition',
      'Registro precisa estar aberto com início válido.',
    );
  const start = Date.parse(source.startedAt),
    paused = speech - input.durationMinutes * 60000;
  if (
    !Number.isFinite(start) ||
    start > speech ||
    speech - start >= 86400000 ||
    paused < start
  )
    throw new PauseError(
      'failed-precondition',
      'Pausa exige registro próprio aberto iniciado há menos de24h; pausa não pode preceder início.',
    );
  const valid = registerInput.safeParse(source);
  if (
    !valid.success ||
    !source.projectSnapshot ||
    typeof source.projectSnapshot !== 'object' ||
    typeof (source.projectSnapshot as { title?: unknown }).title !== 'string' ||
    !Array.isArray(source.topicSnapshots) ||
    source.topicSnapshots.some(
      (t) =>
        !t ||
        typeof t !== 'object' ||
        typeof (t as { id?: unknown }).id !== 'string' ||
        typeof (t as { title?: unknown }).title !== 'string',
    )
  )
    throw new PauseError(
      'failed-precondition',
      'Registro não possui contexto histórico íntegro.',
    );
  if (valid.data.topics?.some((t) => t.durationMinutes !== undefined))
    throw new PauseError(
      'failed-precondition',
      'Durações absolutas de tópicos exigem conciliação explícita; pausa não duplica nem redistribui minutos.',
    );
  if (
    !project.topics.every((t) => typeof t.id === 'string') ||
    valid.data.topics?.some(
      (t) =>
        !project.topics.some(
          (p) => p.id === t.topicId && !p.mergedIntoTopicId && !p.archived,
        ) ||
        !(source.topicSnapshots as { id: string }[]).some(
          (p) => p.id === t.topicId,
        ),
    )
  )
    throw new PauseError(
      'failed-precondition',
      'Contexto de tópicos inexistente; reconcilie explicitamente.',
    );
  return new Date(paused).toISOString();
}
