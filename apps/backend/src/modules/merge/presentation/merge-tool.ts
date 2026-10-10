import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProjectManagementError } from '@work-track/core/registration/domain/project-management';
import {
  mergeInput,
  MergeError,
  type MergeRepository,
} from '@work-track/core/merge/domain/merge';
export function registerMergeTool(
  server: McpServer,
  repository: MergeRepository,
  uid: string,
) {
  server.registerTool(
    'merge_records',
    {
      description:
        'Consulte get_instructions. Mescle dois registros próprios encerrados do mesmo projeto/fuso e distribuição de tópicos em um intervalo contínuo do menor início ao maior fim, mesmo com lacunas ou sobreposição. Lacunas passam a integrar o intervalo; outros projetos não são alterados. Interrupções e minutos absolutos bloqueiam. Prévia somente leitura; mostre destino, textos e horas e peça confirmação humana. Só depois confirmed true com mesmo previewToken/requestId/motivo. Origem é removida logicamente, destino conserva ID; evidências completas ficam na auditoria. Não há desfazer.',
      inputSchema: mergeInput,
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
              text: JSON.stringify(await repository.mergeRecords(input, uid)),
            },
          ],
        };
      } catch (error) {
        const known =
          error instanceof MergeError ||
          error instanceof ProjectManagementError;
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: known ? error.code : 'internal',
                message: known
                  ? error.message
                  : 'Não foi possível mesclar registros.',
              }),
            },
          ],
        };
      }
    },
  );
}
