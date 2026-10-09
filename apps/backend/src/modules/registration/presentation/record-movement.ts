import { HttpsError } from 'firebase-functions/v2/https';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import { ProjectManagementError } from '../domain/project-management.js';
import {
  moveRecordInput,
  moveSubjectInput,
  type MovementRepository,
} from '../domain/record-movement.js';
export async function movementHandler(
  repository: MovementRepository,
  kind: 'move_subject' | 'move_record',
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  try {
    if (kind === 'move_subject') {
      const parsed = moveSubjectInput.safeParse(data);
      if (!parsed.success)
        throw new HttpsError(
          'invalid-argument',
          parsed.error.issues[0]?.message ?? 'Entrada inválida.',
        );
      return await repository.moveSubject(parsed.data, auth!.uid);
    }
    const parsed = moveRecordInput.safeParse(data);
    if (!parsed.success)
      throw new HttpsError(
        'invalid-argument',
        parsed.error.issues[0]?.message ?? 'Entrada inválida.',
      );
    return await repository.moveRecord(parsed.data, auth!.uid);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ProjectManagementError)
      throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível mover atividades.');
  }
}
export function registerMovementTools(
  server: McpServer,
  repository: MovementRepository,
  uid: string,
) {
  const annotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  };
  const description =
    'Consulte get_instructions. Move somente registros próprios entre projetos de mesmo escopo, com auditoria em cada registro. Prévia sem escrita por padrão; apresente destino, contagem e avisos e peça confirmação humana. Só depois confirmed true com mesmo previewToken/requestId/motivo. subject_target opcional reutiliza nome exato normalizado único ativo ou cria assunto com nome original. Múltiplos assuntos/aliases/mais de100 bloqueados; origem preservada para outros participantes. Nunca confirme automaticamente.';
  const run = async (fn: () => Promise<Record<string, unknown>>) => {
    try {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(await fn()) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error:
                error instanceof ProjectManagementError
                  ? error.code
                  : 'internal',
              message:
                error instanceof ProjectManagementError
                  ? error.message
                  : 'Não foi possível mover atividades.',
            }),
          },
        ],
      };
    }
  };
  server.registerTool(
    'move_subject',
    { description, inputSchema: moveSubjectInput, annotations },
    (input) => run(() => repository.moveSubject(input, uid)),
  );
  server.registerTool(
    'move_record',
    { description, inputSchema: moveRecordInput, annotations },
    (input) => run(() => repository.moveRecord(input, uid)),
  );
}
