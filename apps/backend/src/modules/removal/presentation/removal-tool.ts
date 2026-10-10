import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  removalInput,
  RemovalError,
  type RemovalRepository,
} from '@work-track/core/removal/domain/removal';
export function registerRemovalTool(
  server: McpServer,
  repository: RemovalRepository,
  uid: string,
) {
  server.registerTool(
    'remove_record',
    {
      description:
        'Consulte get_instructions. Remove logicamente registro próprio, mantendo fatos e auditoria. Prévia read-only por padrão: apresente registro e impacto nas horas/estimativas; peça confirmação humana. Somente depois confirmed true com mesmo previewToken/requestId/motivo. Pode remover aberto sem inventar fim e registro órfão próprio. Não apaga físico, não remove ligados nem desfaz.',
      inputSchema: removalInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(await repository.removeRecord(input, uid)),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof RemovalError ? error.code : 'internal',
                message:
                  error instanceof RemovalError
                    ? error.message
                    : 'Não foi possível remover registro.',
              }),
            },
          ],
        };
      }
    },
  );
}
