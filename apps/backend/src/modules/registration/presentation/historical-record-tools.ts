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
export type ListRecordsInput = z.infer<typeof listRecordsInput>;
export interface HistoricalRecordsRepository {
  listRecords(input: ListRecordsInput, uid: string): Promise<unknown>;
}
export function registerHistoricalRecordTools(
  server: McpServer,
  repository: HistoricalRecordsRepository,
  uid: string,
) {
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
