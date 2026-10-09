import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WorkRepository } from './work-model.js';
import { projectInput, topicInput, registerInput } from './work-model.js';
import { searchProjects } from './project-search.js';
export function registerWorkTools(
  server: McpServer,
  repository: WorkRepository,
  uid: string,
) {
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
    ({ query, limit }) =>
      run(async () => ({
        projects: searchProjects(await repository.listProjects(), query, limit),
      })),
  );
  server.registerTool(
    'create_project',
    {
      description:
        'Crie projeto compartilhado após pesquisar e não encontrar. Exige título e descrição generosa do escopo. Retorna ID e tópico Geral padrão. Reutiliza títulos normalizados iguais.',
      inputSchema: projectInput,
    },
    (input) => run(() => repository.createProject(input, uid)),
  );
  server.registerTool(
    'create_topic',
    {
      description:
        'Crie tópico em projeto existente; reutilize tópicos retornados pela pesquisa. Geral já existe para atividades sem contexto específico.',
      inputSchema: topicInput,
    },
    (input) => run(() => repository.createTopic(input, uid)),
  );
  server.registerTool(
    'register',
    {
      description:
        'Registre atividade do usuário autenticado: projeto e início obrigatórios; fim opcional, nunca invente. Resolva tempos relativos ao momento da fala, não ao recebimento de transcrição. Preserve texto e interpretação. Aceita vários tópicos existentes e percentuais/durações somente informados; não reparte automaticamente. Sem tópicos usa Geral. Preserve interrupções e sobreposições; não encerra registros anteriores. Vários projetos: uma chamada por projeto. Reutilize requestId nos retries.',
      inputSchema: registerInput,
    },
    (input) => run(() => repository.register(input, uid)),
  );
}
