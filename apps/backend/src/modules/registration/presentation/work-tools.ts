import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  updateProjectInput,
  mergeProjectsInput,
  type ProjectManagementRepository,
} from '../domain/project-management.js';
import {
  updateRecordInput,
  type RecordEditingRepository,
} from '../domain/record-edit.js';
import type { WorkRepository } from '../domain/work-model.js';
import {
  projectInput,
  topicInput,
  registerInput,
} from '../domain/work-model.js';
import { RegistrationService } from '../application/registration-service.js';
export function registerWorkTools(
  server: McpServer,
  repository: WorkRepository,
  uid: string,
  editing?: RecordEditingRepository,
  management?: ProjectManagementRepository,
) {
  const service = new RegistrationService(repository);
  const output = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  });
  const run = async (work: () => Promise<unknown>) => {
    try {
      return output(await work());
    } catch (error) {
      return {
        ...output({
          error: error instanceof Error ? error.message : 'Falha na operação.',
        }),
        isError: true,
      };
    }
  };
  if (management) {
    server.registerTool(
      'update_project',
      {
        description:
          'Edite metadados de projeto com ID explícito, motivo e requestId estável. Confidencialidade é apenas apresentação, não autorização.',
        inputSchema: updateProjectInput,
      },
      (input) => run(() => management.updateProject(input, uid)),
    );
    server.registerTool(
      'merge_projects',
      {
        description:
          'Preview sem mutation por padrão. Exige origem/destino explícitos. confirmed true, requestId e motivo executam um lote até100. Repetir retoma. Nunca escolher ou confirmar sem pedido humano.',
        inputSchema: mergeProjectsInput,
      },
      (input) => run(() => management.mergeProjects(input, uid)),
    );
  }
  if (editing) {
    server.registerTool(
      'update_record',
      {
        description:
          'Edite registro próprio com ID explícito e motivo. endedAt null reabre explicitamente; não infira horário.',
        inputSchema: updateRecordInput,
      },
      (input) => run(() => editing.updateRecord(input, uid)),
    );
  }
  server.registerTool(
    'search_projects',
    {
      description:
        'Pesquise antes de registrar/criar. Busca aproximada por título, descrição e tópicos, com acentos e erros de escrita; não usa embeddings. Sem query lista projetos. Retorna IDs, tópicos e scores. Pergunte em caso de ambiguidade.',
      inputSchema: z.object({
        query: z.string().max(500).default(''),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ query, limit }) => run(() => service.search(query, limit)),
  );
  server.registerTool(
    'create_project',
    {
      description:
        'Crie projeto compartilhado após pesquisar e não encontrar. Exige título e descrição generosa do escopo. Retorna ID e tópico Geral padrão. Reutiliza títulos normalizados iguais.',
      inputSchema: projectInput,
    },
    (input) => run(() => service.createProject(input, uid)),
  );
  server.registerTool(
    'create_topic',
    {
      description:
        'Crie tópico em projeto existente; reutilize tópicos retornados pela pesquisa. Geral já existe para atividades sem contexto específico.',
      inputSchema: topicInput,
    },
    (input) => run(() => service.createTopic(input, uid)),
  );
  server.registerTool(
    'register',
    {
      description:
        'Registre atividade do usuário autenticado: projeto e início obrigatórios; fim opcional, nunca invente. Resolva tempos relativos ao momento da fala, não ao recebimento de transcrição. Preserve texto e interpretação. Aceita vários tópicos existentes e percentuais/durações somente informados; não reparte automaticamente. Sem tópicos usa Geral. Preserve interrupções e sobreposições; não encerra registros anteriores. Vários projetos: uma chamada por projeto. closePrevious padrão false; pergunte e obtenha confirmação humana explícita antes de true, exige motivo; múltiplos abertos exigem closedPreviousRecordId explícito, nunca adivinhe. Reutilize requestId nos retries.',
      inputSchema: registerInput,
    },
    (input) =>
      run(async () => {
        const saved = await service.register(input, uid);
        if (!editing) return saved;
        try {
          const open = await editing.listOpenRecords(uid, 10);
          const previous = open.records.filter(
            (record) => record.id !== saved.id,
          );
          return {
            ...saved,
            openRecords: previous,
            openRecordsPartial: open.partial,
            warnings: [
              ...(Array.isArray(saved.warnings)
                ? (saved.warnings as string[])
                : []),
              ...(previous.length
                ? [
                    'Há registros ainda abertos. Confirme troca de atividade ou simultaneidade; nada foi encerrado automaticamente.',
                    ...(open.partial
                      ? [
                          'Lista de abertos parcial: até 10 itens de uma leitura limitada a 500 registros.',
                        ]
                      : []),
                  ]
                : open.partial
                  ? [
                      'Lista de abertos parcial; não é possível afirmar que todos foram conciliados.',
                    ]
                  : []),
            ],
          };
        } catch {
          return {
            ...saved,
            warnings: [
              'Registro salvo, mas não foi possível consultar atividades abertas. Verifique closedPreviousRecordId para eventual encerramento confirmado; não houve encerramento automático.',
            ],
            openRecords: [],
            openRecordsPartial: true,
          };
        }
      }),
  );
}
