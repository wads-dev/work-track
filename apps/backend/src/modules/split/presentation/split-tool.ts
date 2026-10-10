import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProjectManagementError } from '@work-track/core/registration/domain/project-management';
import {
  splitInput,
  SplitError,
  type SplitRepository,
} from '@work-track/core/split/domain/split';
export function registerSplitTool(
  server: McpServer,
  repository: SplitRepository,
  uid: string,
) {
  server.registerTool(
    'split_record',
    {
      description:
        'Consulte get_instructions. Divida trecho explícito de registro próprio encerrado para projeto/tópicos existentes sem duplicar horas. Prévia somente leitura por padrão; mostre segmentos e peça confirmação humana. Só depois confirmed true, mesmo requestId/motivo e previewToken. Transferência pessoal para corporativo publica texto original completo e interpretação: informe a pessoa e exija acknowledgeSharedDestination true após confirmação explícita. Não invente fim de aberto. Minutos absolutos de tópicos e interrupções ambíguas exigem repartição explícita em fluxo separado; não tente apagá-los. Não é abono, faturamento nem undo.',
      inputSchema: splitInput,
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
              text: JSON.stringify(await repository.splitRecord(input, uid)),
            },
          ],
        };
      } catch (error) {
        const known =
          error instanceof SplitError ||
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
                  : 'Não foi possível dividir registro.',
              }),
            },
          ],
        };
      }
    },
  );
}
