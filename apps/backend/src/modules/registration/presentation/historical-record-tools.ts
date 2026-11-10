import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const listRecordsInput = z
  .object({
    projectId: id.optional(),
    recordOwnerUid: id.optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    topicId: id.optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().max(2048).optional(),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || Date.parse(v.from) < Date.parse(v.to),
    'Intervalo inválido.',
  );
export const updateRecordTopicsBatchInput = z
  .object({
    requestId: id,
    confirmed: z.boolean().default(false),
    records: z
      .array(
        z
          .object({
            recordId: id,
            recordOwnerUid: id.optional(),
            topicIds: z.array(id).min(1).max(30),
            expectedVersion: z.string().min(1).max(100),
            reason: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.records.map((r) => (r.recordOwnerUid ?? '') + '/' + r.recordId))
        .size === v.records.length,
    'Registros duplicados.',
  );
export type UpdateRecordTopicsBatchInput = z.infer<
  typeof updateRecordTopicsBatchInput
>;
export const getRecordInput = z
  .object({ recordId: id, recordOwnerUid: id.optional() })
  .strict();
export type GetRecordInput = z.infer<typeof getRecordInput>;
export type ListRecordsInput = z.infer<typeof listRecordsInput>;
export interface HistoricalRecordsRepository {
  updateRecordTopicsBatch(
    input: UpdateRecordTopicsBatchInput,
    uid: string,
  ): Promise<unknown>;
  getRecord(input: GetRecordInput, uid: string): Promise<unknown>;
  listRecords(input: ListRecordsInput, uid: string): Promise<unknown>;
}
export function registerHistoricalRecordTools(
  server: McpServer,
  repository: HistoricalRecordsRepository,
  uid: string,
) {
  server.registerTool(
    'update_record_topics_batch',
    {
      description:
        'Corrija somente tópicos de até100 registros. Prévia sem escrita por padrão; confirmed true executa transações individuais com resultado por registro. Exige expectedVersion de get_record/list_records, motivo por item e requestId estável; retries idênticos não duplicam auditoria. Nunca altera fatos ou distribuições: registros distribuídos rejeitam remapeamentos; nenhuma distribuição é inventada. Leia evidências e mantenha casos ambíguos intactos.',
      inputSchema: updateRecordTopicsBatchInput,
      annotations: { idempotentHint: true, destructiveHint: true },
    },
    async (input) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                await repository.updateRecordTopicsBatch(input, uid),
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text:
                error instanceof Error
                  ? error.message
                  : 'Operação indisponível.',
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    'get_record',
    {
      description:
        'Leia registro completo por ID e proprietário (padrão: você), incluindo evidências, interrupções, distribuições e expectedVersion atual. Respeita ACL do projeto.',
      inputSchema: getRecordInput,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(await repository.getRecord(input, uid)),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text:
                error instanceof Error
                  ? error.message
                  : 'Consulta indisponível.',
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    'list_records',
    {
      description:
        'Liste registros históricos completos por projeto, proprietário (padrão: você), período ISO [from,to) por sobreposição e topicId, inclusive ID de Geral. Retorna totalCount exato ou erro de orçamento, hasMore e nextCursor. Cursor é invalidado quando o histórico muda. Leia evidências antes de corrigir; casos ambíguos permanecem intactos.',
      inputSchema: listRecordsInput,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(await repository.listRecords(input, uid)),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text:
                error instanceof Error
                  ? error.message
                  : 'Consulta indisponível.',
            },
          ],
        };
      }
    },
  );
}
