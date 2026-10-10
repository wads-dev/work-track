import { z } from 'zod';
import { metadata } from '../registration/domain/project-management.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const instant = z.iso.datetime({ offset: true });
export const projectInput = z.object({
  ...metadata,
  type: z
    .enum(['personal', 'work'])
    .describe(
      'Obrigatório: personal=pessoal, somente proprietário; work=corporativo, compartilhado com a organização. Pergunte à pessoa; nunca infira ou use padrão.',
    ),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(20).max(6000),
});
export const topicInput = z.object({
  projectId: id,
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(5).max(3000),
});
export const registerInput = z
  .object({
    projectId: id,
    startedAt: instant.describe(
      'Início efetivo inferido da fala; ISO 8601 com fuso. Nunca use o horário de chegada de uma transcrição atrasada como referência.',
    ),
    closePrevious: z
      .boolean()
      .optional()
      .describe(
        'Padrão false. Só true após confirmação humana explícita para encerrar anterior no mesmo projeto.',
      ),
    closedPreviousRecordId: id.optional(),
    closePreviousReason: z.string().trim().min(1).max(1000).optional(),
    endedAt: instant.optional(),
    commandAt: instant
      .optional()
      .describe(
        'Momento em que a pessoa falou, se conhecido; não é o horário de gravação.',
      ),
    timeZone: z.string().refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, 'Fuso IANA inválido'),
    originalText: z.string().min(1).max(12000),
    interpretation: z.string().min(1).max(6000),
    topics: z
      .array(
        z.object({
          topicId: id,
          percentage: z.number().positive().max(100).optional(),
          durationMinutes: z.number().positive().optional(),
        }),
      )
      .max(30)
      .optional(),
    interruptions: z
      .array(
        z.object({
          description: z.string().min(1).max(1000),
          startedAt: instant.optional(),
          endedAt: instant.optional(),
          durationMinutes: z.number().positive().optional(),
        }),
      )
      .max(30)
      .optional(),
    requestId: id.describe(
      'Chave estável para esta intenção de registro; reutilize ao repetir uma chamada após falha para evitar duplicação.',
    ),
  })
  .superRefine((value, ctx) => {
    const error = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    if (
      value.endedAt &&
      Date.parse(value.endedAt) < Date.parse(value.startedAt)
    )
      error('Fim anterior ao início.');
    if (value.closePrevious && !value.closePreviousReason)
      error('Encerramento confirmado exige motivo.');
    if (
      !value.closePrevious &&
      (value.closedPreviousRecordId || value.closePreviousReason)
    )
      error('Encerramento exige closePrevious true explícito.');
    const topics = value.topics ?? [];
    if (new Set(topics.map((topic) => topic.topicId)).size !== topics.length)
      error('Tópicos duplicados.');
    if (topics.reduce((sum, topic) => sum + (topic.percentage ?? 0), 0) > 100)
      error('Percentuais excedem 100%.');
    for (const interruption of value.interruptions ?? [])
      if (
        interruption.startedAt &&
        interruption.endedAt &&
        Date.parse(interruption.endedAt) < Date.parse(interruption.startedAt)
      )
        error('Interrupção com fim anterior ao início.');
  });
export type RegisterInput = z.infer<typeof registerInput>;
export type ProjectInput = z.infer<typeof projectInput>;
export type TopicInput = z.infer<typeof topicInput>;
