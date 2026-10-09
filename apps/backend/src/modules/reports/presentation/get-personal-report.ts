import { HttpsError } from 'firebase-functions/v2/https';
import { ReportContextError } from '../domain/global-estimates.js';
import { z } from 'zod';
import { authorizeReport, type ReportAuth } from './get-project-report.js';
import type { PersonalReportRepository } from '../domain/personal-report.js';
import { buildPersonalReport } from '../domain/build-personal-report.js';
const schema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    timeZone: z
      .string()
      .max(100)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }),
    limit: z.number().int().min(1).max(500).default(200),
    includeArchived: z.boolean().default(false),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.to) > Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= (31 * 24 + 1) * 60 * 60000,
    'Período deve ter até31 dias e fim posterior ao início.',
  );
export async function getPersonalReportHandler(
  repository: PersonalReportRepository,
  data: unknown,
  auth?: ReportAuth,
  asOf = Date.now(),
) {
  authorizeReport(auth);
  const input = schema.safeParse(data);
  if (!input.success)
    throw new HttpsError(
      'invalid-argument',
      'Período, fuso, limite ou cursor inválido.',
    );
  try {
    const page = await repository.readPage(
      auth!.uid,
      input.data.limit,
      input.data.cursor,
    );
    const context = await repository.loadContext([auth!.uid]);
    const report = buildPersonalReport(input.data, page, asOf, context);
    if (!input.data.includeArchived) {
      const archived = new Set(
        await repository.archivedProjectIds([
          ...new Set(page.records.map((r) => r.projectId)),
        ]),
      );
      const removed = report.intervals.filter((r) => archived.has(r.projectId));
      report.intervals = report.intervals.filter(
        (r) => !archived.has(r.projectId),
      );
      report.byProject = report.byProject.filter(
        (r) => !archived.has(r.projectId),
      );
      report.totalMinutes = report.intervals.reduce(
        (sum, r) => sum + r.minutes,
        0,
      );
      report.estimatedCount = report.intervals.filter(
        (r) => r.estimated,
      ).length;
      report.page.excludedCount += removed.length;
      report.warnings.push(
        'Seleção ativa exclui projetos arquivados ou ausentes da visualização; orçamento global continua incluindo todos os fatos.',
      );
    }
    return report;
  } catch (error) {
    if (error instanceof ReportContextError)
      throw new HttpsError('resource-exhausted', error.message);
    throw new HttpsError(
      'internal',
      'Não foi possível consultar o relatório pessoal.',
    );
  }
}
