import type { TopicDetailReport } from '../../contracts/report-responses.js';
import { z } from 'zod';
import { ReportContextError } from '../domain/global-estimates.js';
import { buildTopicDetails } from '../domain/topic-details.js';
import type {
  ProjectReportRepository,
  ReportSourceRecord,
} from '../domain/project-report.js';
export class TopicReportError extends Error {
  constructor(
    readonly code:
      | 'invalid-argument'
      | 'not-found'
      | 'failed-precondition'
      | 'resource-exhausted',
    message: string,
  ) {
    super(message);
  }
}
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const topicInput = z
  .object({
    projectId: id,
    topicId: id,
    includeArchived: z.boolean().default(false),
  })
  .strict();
export interface TopicReportRepository extends ProjectReportRepository {
  revalidate(
    records: ReportSourceRecord[],
    viewerUid: string,
    personal: boolean,
  ): Promise<ReportSourceRecord[]>;
}
export async function getTopicReport(
  repository: TopicReportRepository,
  data: unknown,
  uid: string,
  asOf = Date.now(),
) {
  const parsed = topicInput.safeParse(data);
  if (!parsed.success)
    throw new TopicReportError(
      'invalid-argument',
      'Projeto e tópico inválidos.',
    );
  const input = parsed.data;
  try {
    const records: ReportSourceRecord[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    let initial: Awaited<ReturnType<ProjectReportRepository['readPage']>> =
      null;
    for (let pages = 0; pages < 20; pages++) {
      const page = await repository.readPage(
        input.projectId,
        100,
        cursor,
        uid,
        { topicId: input.topicId, includeArchived: true },
      );
      if (!page)
        throw new TopicReportError('not-found', 'Projeto não encontrado.');
      if (!initial) initial = page;
      else if (
        page.personal !== initial.personal ||
        page.archived !== initial.archived ||
        JSON.stringify(page.topics) !== JSON.stringify(initial.topics)
      )
        throw new TopicReportError(
          'failed-precondition',
          'Projeto ou tópicos alterados durante leitura.',
        );
      if (page.archived && !input.includeArchived)
        throw new TopicReportError(
          'failed-precondition',
          'Projeto arquivado; inclua histórico explicitamente.',
        );
      records.push(...page.records);
      if (records.length > 2000)
        throw new ReportContextError('Histórico excede2000registros.');
      if (!page.nextCursor) break;
      if (seen.has(page.nextCursor) || pages === 19)
        throw new ReportContextError(
          'Histórico físico completo indisponível; nenhuma página parcial retornada.',
        );
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    if (!initial)
      throw new TopicReportError('not-found', 'Projeto não encontrado.');
    const topics = initial.topics ?? [];
    if (!topics.some((t) => t.id === input.topicId))
      throw new TopicReportError('not-found', 'Tópico não encontrado.');
    const visible = await repository.revalidate(
      records,
      uid,
      Boolean(initial.personal),
    );
    if (visible.length !== records.length)
      throw new TopicReportError(
        'failed-precondition',
        'Privacidade alterada durante leitura.',
      );
    if (new Set(records.map((r) => r.uid)).size > 100)
      throw new ReportContextError(
        'Tópico excede100participantes; nenhuma seleção parcial retornada.',
      );
    const context = await repository.loadContext(
      [...new Set(records.map((r) => r.uid))],
      initial.personal ? uid : undefined,
    );
    const labels = await repository.userLabels([
      ...new Set(visible.map((r) => r.uid)),
    ]);
    const result = buildTopicDetails(
      input.projectId,
      input.topicId,
      visible,
      context,
      topics,
      asOf,
      uid,
      labels,
    );
    const final = await repository.readPage(
      input.projectId,
      100,
      undefined,
      uid,
    );
    if (
      !final ||
      final.personal !== initial.personal ||
      final.archived !== initial.archived ||
      JSON.stringify(final.topics) !== JSON.stringify(topics)
    )
      throw new TopicReportError(
        'failed-precondition',
        'Projeto ou tópicos alterados durante leitura.',
      );
    if (
      (await repository.revalidate(visible, uid, Boolean(initial.personal)))
        .length !== visible.length
    )
      throw new TopicReportError(
        'failed-precondition',
        'Privacidade alterada durante leitura.',
      );
    return {
      policy: 'topic-report-v3' as const,
      scope: 'all-selected' as const,
      projectId: input.projectId,
      requestedTopicId: input.topicId,
      mode: initial.personal ? ('own' as const) : ('global' as const),
      viewerUid: uid,
      hoursPolicy: initial.personal
        ? ('personal-v3' as const)
        : ('company-v3' as const),
      budgetTimeZone: 'America/Sao_Paulo' as const,
      asOf: new Date(asOf).toISOString(),
      ...result,
      page: { limit: 2000, nextCursor: null, partial: false },
    } satisfies TopicDetailReport;
  } catch (error) {
    if (error instanceof TopicReportError) throw error;
    if (error instanceof ReportContextError)
      throw new TopicReportError('resource-exhausted', error.message);
    throw new TopicReportError(
      'failed-precondition',
      'Não foi possível obter detalhes completos e autorizados do tópico.',
    );
  }
}
