import { z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';
import { authorizeReport, type ReportAuth } from './get-project-report.js';
import { ReportContextError } from '../domain/global-estimates.js';
import { buildTopicDetails } from '../domain/topic-details.js';
import type {
  ProjectReportRepository,
  ReportSourceRecord,
} from '../domain/project-report.js';
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
export async function getTopicReportHandler(
  repository: TopicReportRepository,
  data: unknown,
  auth?: ReportAuth,
  asOf = Date.now(),
) {
  authorizeReport(auth);
  const parsed = topicInput.safeParse(data);
  if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Projeto e assunto inválidos.');
  const input = parsed.data,
    uid = auth!.uid;
  try {
    const records: ReportSourceRecord[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    let initial: Awaited<ReturnType<ProjectReportRepository['readPage']>> =
      null;
    for (let pages = 0; pages < 20; pages++) {
      const page = await repository.readPage(input.projectId, 100, cursor, uid);
      if (!page) throw new HttpsError('not-found', 'Projeto não encontrado.');
      if (!initial) initial = page;
      else if (
        page.personal !== initial.personal ||
        page.archived !== initial.archived ||
        JSON.stringify(page.topics) !== JSON.stringify(initial.topics)
      )
        throw new HttpsError(
          'failed-precondition',
          'Projeto ou assuntos alterados durante leitura.',
        );
      if (page.archived && !input.includeArchived)
        throw new HttpsError(
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
    if (!initial) throw new HttpsError('not-found', 'Projeto não encontrado.');
    const topics = initial.topics ?? [];
    if (!topics.some((t) => t.id === input.topicId))
      throw new HttpsError('not-found', 'Assunto não encontrado.');
    const visible = await repository.revalidate(
      records,
      uid,
      Boolean(initial.personal),
    );
    if (visible.length !== records.length)
      throw new HttpsError(
        'failed-precondition',
        'Privacidade alterada durante leitura.',
      );
    if (new Set(records.map((r) => r.uid)).size > 100)
      throw new ReportContextError(
        'Assunto excede100participantes; nenhuma seleção parcial retornada.',
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
      throw new HttpsError(
        'failed-precondition',
        'Projeto ou assuntos alterados durante leitura.',
      );
    if (
      (await repository.revalidate(visible, uid, Boolean(initial.personal)))
        .length !== visible.length
    )
      throw new HttpsError(
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
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ReportContextError)
      throw new HttpsError('resource-exhausted', error.message);
    throw new HttpsError(
      'failed-precondition',
      'Não foi possível obter detalhes completos e autorizados do assunto.',
    );
  }
}
