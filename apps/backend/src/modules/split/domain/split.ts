import { isDeletedRecord } from '../../registration/domain/record-lifecycle.js';
import { z } from 'zod';
import {
  safeId,
  assertProjectWritable,
} from '../../registration/domain/project-management.js';
import { assertProjectAccess } from '../../registration/domain/project-access.js';
import type { Project } from '../../registration/domain/work-model.js';
export const splitInput = z
  .object({
    recordId: safeId,
    segmentStartedAt: z.iso.datetime({ offset: true }),
    segmentEndedAt: z.iso.datetime({ offset: true }),
    destinationProjectId: safeId,
    destinationTopics: z
      .array(
        z
          .object({
            topicId: safeId,
            percentage: z.number().positive().max(100).optional(),
          })
          .strict(),
      )
      .max(30),
    requestId: safeId,
    reason: z.string().trim().min(3).max(6000),
    confirmed: z.boolean().default(false),
    acknowledgeSharedDestination: z.boolean().default(false),
    previewToken: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .refine(
    (v) => !v.confirmed || !!v.previewToken,
    'Confirmação exige token da prévia.',
  )
  .refine(
    (v) =>
      new Set(v.destinationTopics.map((t) => t.topicId)).size ===
        v.destinationTopics.length &&
      v.destinationTopics.reduce((sum, t) => sum + (t.percentage ?? 0), 0) <=
        100,
  );
export type SplitInput = z.infer<typeof splitInput>;
export class SplitError extends Error {
  constructor(
    readonly code:
      'invalid-argument' | 'not-found' | 'failed-precondition' | 'aborted',
    message: string,
  ) {
    super(message);
  }
}
export type SplitPart = {
  role: 'before' | 'moved' | 'after';
  data: Record<string, unknown>;
  milliseconds: number;
};
export interface SplitResult {
  confirmed: boolean;
  requiresSharedAcknowledgment: boolean;
  warnings: string[];
  operationId: string;
  previewToken: string;
  totalMilliseconds: number;
  parts: {
    recordId: string;
    role: SplitPart['role'];
    data: Record<string, unknown>;
    milliseconds: number;
  }[];
}
export interface SplitRepository {
  splitRecord(
    input: SplitInput,
    uid: string,
    now?: number,
  ): Promise<SplitResult>;
}
export function planSplit(
  source: Record<string, unknown>,
  origin: Project | undefined,
  destination: Project | undefined,
  input: SplitInput,
  uid: string,
  now: number,
): SplitPart[] {
  if (isDeletedRecord(source))
    throw new SplitError(
      'failed-precondition',
      'Registro removido; divisão não permitida.',
    );
  if (source.uid !== uid)
    throw new SplitError('not-found', 'Registro não encontrado.');
  assertProjectAccess(origin, uid);
  assertProjectAccess(destination, uid);
  assertProjectWritable(origin);
  assertProjectWritable(destination);
  if (
    source.projectId !== origin.id ||
    input.destinationProjectId !== destination.id
  )
    throw new SplitError(
      'failed-precondition',
      'Contexto de projeto divergente.',
    );
  const instant = z.iso.datetime({ offset: true });
  if (
    !instant.safeParse(source.startedAt).success ||
    !instant.safeParse(source.endedAt).success
  )
    throw new SplitError(
      'failed-precondition',
      'Divisão exige início e fim factuais explícitos; registro aberto não é elegível.',
    );
  const start = Date.parse(source.startedAt as string),
    end = Date.parse(source.endedAt as string),
    a = Date.parse(input.segmentStartedAt),
    b = Date.parse(input.segmentEndedAt);
  if (
    ![start, end, a, b, now].every(Number.isFinite) ||
    start >= end ||
    a < start ||
    b > end ||
    a >= b ||
    end > now
  )
    throw new SplitError(
      'invalid-argument',
      'Trecho positivo deve estar contido em fato encerrado passado.',
    );
  if (
    source.topics !== undefined &&
    (!Array.isArray(source.topics) ||
      source.topics.some(
        (t: unknown) => !t || typeof t !== 'object' || 'durationMinutes' in t,
      ))
  )
    throw new SplitError(
      'failed-precondition',
      'Minutos absolutos de assuntos exigem repartição explícita; nenhuma alteração.',
    );
  if (
    source.interruptions !== undefined &&
    (!Array.isArray(source.interruptions) || source.interruptions.length > 0)
  )
    throw new SplitError(
      'failed-precondition',
      'Interrupções exigem repartição temporal explícita; nenhuma alteração.',
    );
  if (!Array.isArray(destination.topics))
    throw new SplitError('failed-precondition', 'Catálogo destino inválido.');
  const destinationTopics = input.destinationTopics.length
    ? input.destinationTopics
    : (() => {
        const general = destination.topics.filter(
          (t) =>
            t.title
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase() === 'geral' &&
            !t.archived &&
            !t.mergedIntoTopicId,
        );
        if (general.length !== 1)
          throw new SplitError(
            'failed-precondition',
            'Escolha assuntos explícitos; Geral canônico único não encontrado.',
          );
        return [{ topicId: general[0]!.id }];
      })();
  for (const t of destinationTopics) {
    const matches = destination.topics.filter(
      (topic) => topic.id === t.topicId,
    );
    if (
      matches.length !== 1 ||
      matches[0]!.archived ||
      matches[0]!.mergedIntoTopicId
    )
      throw new SplitError(
        'failed-precondition',
        'Assunto destino inexistente, arquivado ou alias; escolha assunto canônico.',
      );
  }
  if (
    origin.type === 'personal' &&
    (destination.type === undefined || destination.type === 'work')
  ) {
    const known = new Set([
      'id',
      'uid',
      'projectId',
      'startedAt',
      'endedAt',
      'timeZone',
      'originalText',
      'interpretation',
      'topics',
      'interruptions',
      'requestId',
      'fingerprint',
      'receivedAt',
      'recordedAt',
      'commandAt',
      'projectSnapshot',
      'topicSnapshots',
      'updatedAt',
      'updatedBy',
    ]);
    if (Object.keys(source).some((key) => !known.has(key)))
      throw new SplitError(
        'failed-precondition',
        'Origem pessoal contém metadados adicionais; transferência para projeto compartilhado exige revisão explícita de confidencialidade. Não apague dados.',
      );
  }
  const parts: SplitPart[] = [];
  if (start < a)
    parts.push({
      role: 'before',
      data: { ...source, endedAt: input.segmentStartedAt },
      milliseconds: a - start,
    });
  parts.push({
    role: 'moved',
    data: {
      ...source,
      startedAt: input.segmentStartedAt,
      endedAt: input.segmentEndedAt,
      projectId: destination.id,
      topics: destinationTopics,
      projectSnapshot: {
        title: destination.title,
        description: destination.description,
      },
      topicSnapshots: destinationTopics.map((t) => {
        const topic = destination.topics.find((x) => x.id === t.topicId)!;
        return {
          id: topic.id,
          title: topic.title,
          description: topic.description,
        };
      }),
    },
    milliseconds: b - a,
  });
  if (b < end)
    parts.push({
      role: 'after',
      data: { ...source, startedAt: input.segmentEndedAt },
      milliseconds: end - b,
    });
  const moved = parts.find((p) => p.role === 'moved')!;
  delete moved.data.topicResolution;
  delete moved.data.closedPreviousRecordId;
  delete moved.data.closePrevious;
  delete moved.data.closePreviousReason;
  return parts;
}
