import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProjectManagementError } from '@work-track/core/registration/domain/project-management';
import {
  PauseError,
  pauseInput,
  type PauseRepository,
} from '@work-track/core/pause/domain/pause';
export function registerPauseTool(
  server: McpServer,
  repository: PauseRepository,
  uid: string,
) {
  server.registerTool(
    'register_pause',
    {
      description:
        'Antes de usar consulte get_instructions. Somente pausa PASSADA de minutos explícitos: resumedAt é o momento ISO da fala/retomada, nunca o recebimento. Fecha registro próprio aberto (<24h) no início da pausa e cria retomada atômica no mesmo contexto. Se múltiplos, pergunte recordId. requestId estável, motivo e fala original obrigatórios. Vou pausar (futuro): NÃO use esta ferramenta; update_record só encerra agora sem criar retomada.',
      inputSchema: pauseInput,
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
              text: JSON.stringify(await repository.registerPause(input, uid)),
            },
          ],
        };
      } catch (error) {
        const known =
          error instanceof PauseError ||
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
                  : 'Não foi possível registrar pausa.',
                ...(error instanceof PauseError && error.candidates
                  ? { candidates: error.candidates }
                  : {}),
              }),
            },
          ],
        };
      }
    },
  );
}
