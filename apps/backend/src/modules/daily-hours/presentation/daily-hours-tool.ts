import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReportContextError } from '../../reports/domain/global-estimates.js';
import {
  dailyHoursInput,
  getDailyHours,
  DailyHoursError,
  type DailyHoursRepository,
} from '../domain/daily-hours.js';
export function registerDailyHoursTool(
  server: McpServer,
  repository: DailyHoursRepository,
  uid: string,
) {
  server.registerTool(
    'get_daily_hours',
    {
      description:
        'Consulte get_instructions antes de usar. Consulta somente leitura das próprias horas por dia YYYY-MM-DD e projeto opcional. Fuso IANA padrão America/Sao_Paulo, arquivados incluídos por padrão para conciliação histórica. Separa fatos fechados de estimativas abertas, sem inventar fim; recorta o dia local e usa orçamento global personal-v3 antes dos filtros. Não escreve, importa ou concilia dados da planilha.',
      inputSchema: dailyHoursInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const result = await getDailyHours(repository, input, uid);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        const code =
          error instanceof DailyHoursError
            ? error.code
            : error instanceof ReportContextError
              ? 'resource-exhausted'
              : 'internal';
        const message =
          error instanceof DailyHoursError ||
          error instanceof ReportContextError
            ? error.message
            : 'Não foi possível consultar as horas próprias.';
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: code, message }),
            },
          ],
        };
      }
    },
  );
}
