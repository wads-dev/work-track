import { HttpsError } from 'firebase-functions/v2/https';
import { completeSelection } from '../application/complete-selection.js';
import { z } from 'zod';
import { authorizeReport, type ReportAuth } from './get-project-report.js';
import { ReportContextError } from '../domain/global-estimates.js';
import { buildCompanyReport } from '../domain/build-company-report.js';
import type { CompanyReportRepository } from '../domain/company-report.js';
const schema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    projectId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
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
    limit: z.number().int().min(1).max(100).default(50),
    includeArchived: z.boolean().default(false),
    cursor: z
      .string()
      .max(512)
      .regex(
        new RegExp('^users/[A-Za-z0-9_-]{1,128}/records/[A-Za-z0-9_-]{1,128}$'),
      )
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      !v.from ||
      !v.to ||
      Boolean(
        v.from &&
        v.to &&
        Date.parse(v.to) > Date.parse(v.from) &&
        Date.parse(v.to) - Date.parse(v.from) <= (93 * 24 + 1) * 3600000,
      ),
    'Período até93dias+1h.',
  );
export async function getCompanyReportHandler(
  repository: CompanyReportRepository,
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
    const page = await completeSelection((cursor) =>
        repository.readPage(100, cursor, input.data.projectId),
      ),
      uids = [...new Set(page.records.map((r) => r.uid))];
    if (uids.length > 10)
      throw new ReportContextError(
        'Página contém mais de10 pessoas; reduza limit para consultar contexto global completo.',
      );
    const context = await repository.loadContext(uids),
      archived = input.data.includeArchived
        ? []
        : await repository.archivedProjectIds([
            ...new Set(page.records.map((r) => r.projectId)),
          ]),
      labels = await repository.userLabels(uids);
    const report = buildCompanyReport(
      { ...input.data, cursor: undefined },
      page,
      context,
      asOf,
      labels,
      archived,
    );
    report.scope = 'all-selected';
    report.page.partial = false;
    report.page.limit = 2000;
    report.warnings = report.warnings.filter(
      (w) => !w.includes('página selecionada'),
    );
    report.warnings.push(
      'Totais completos da seleção dentro dos limites operacionais; nenhum subtotal de primeira página.',
    );
    return report;
  } catch (error) {
    if (error instanceof ReportContextError)
      throw new HttpsError('resource-exhausted', error.message);
    throw new HttpsError(
      'internal',
      'Não foi possível consultar o relatório empresarial.',
    );
  }
}
