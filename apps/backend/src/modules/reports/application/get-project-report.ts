import { z } from 'zod';
import { completeSelection } from './complete-selection.js';
import type { ProjectReportRepository } from '../domain/project-report.js';
import { buildProjectReport } from '../domain/build-project-report.js';
const inputSchema = z
  .object({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    limit: z.number().int().min(1).max(500).default(200),
    includeArchived: z.boolean().default(false),
    cursor: z
      .string()
      .max(512)
      .regex(
        new RegExp('^users/[A-Za-z0-9_-]{1,128}/records/[A-Za-z0-9_-]{1,128}$'),
      )
      .optional(),
  })
  .strict();
export class ReportRequestError extends Error {
  constructor(
    readonly code: 'invalid-argument' | 'not-found' | 'failed-precondition',
    message: string,
  ) {
    super(message);
  }
}
export async function getProjectReport(
  repository: ProjectReportRepository,
  data: unknown,
  asOf = Date.now(),
  viewerUid?: string,
) {
  const input = inputSchema.safeParse(data);
  if (!input.success)
    throw new ReportRequestError(
      'invalid-argument',
      'Projeto, limite ou cursor inválido.',
    );
  const page = await repository.readPage(
    input.data.projectId,
    input.data.limit,
    input.data.cursor,
    viewerUid,
  );
  if (!page)
    throw new ReportRequestError('not-found', 'Projeto não encontrado.');
  if (page.archived && !input.data.includeArchived)
    throw new ReportRequestError(
      'failed-precondition',
      'Projeto arquivado; inclua includeArchived para consultar histórico.',
    );
  const full = await completeSelection(async (cursor) => {
    const p = await repository.readPage(
      input.data.projectId,
      500,
      cursor,
      viewerUid,
    );
    if (!p)
      throw new ReportRequestError('not-found', 'Projeto não encontrado.');
    return p;
  });
  page.records = full.records;
  page.nextCursor = null;
  const context = await repository.loadContext(
    [...new Set(page.records.map((r) => r.uid))],
    page.personal ? viewerUid : undefined,
  );
  const labels = await repository.userLabels([
    ...new Set(page.records.map((record) => record.uid)),
  ]);
  const report = buildProjectReport(
    input.data.projectId,
    page,
    input.data.limit,
    asOf,
    labels,
    false,
    context,
  );
  report.scope = 'all-selected';
  report.page.limit = 2000;
  report.warnings.push(
    'Totais completos da seleção dentro dos limites operacionais.',
  );
  return report;
}
