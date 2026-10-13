import { completeSelection } from './complete-selection.js';
import { completeReportWarnings } from '../domain/calendar-occurrences.js';
import { buildTopicBreakdown } from '../domain/topic-breakdown.js';
import { ReportContextError } from '../domain/global-estimates.js';
import { buildCompanyReport } from '../domain/build-company-report.js';
import type {
  CompanyReportRepository,
  CompanyReportInput,
} from '../domain/company-report.js';
/** Authorization and input validation belong to the transport; calculation is shared. */
export async function executeCompanyReport(
  repository: CompanyReportRepository,
  input: CompanyReportInput,
  asOf = Date.now(),
) {
  const page = await completeSelection((cursor) =>
      repository.readPage(100, cursor, input.projectId, {
        includeArchived: input.includeArchived,
        from: input.from,
        to: input.to,
      }),
    ),
    uids = [...new Set(page.records.map((r) => r.uid))];
  if (uids.length > 10)
    throw new ReportContextError(
      'Página contém mais de10 pessoas; reduza limit para consultar contexto global completo.',
    );
  const context = await repository.loadContext(uids),
    labels = await repository.userLabels(uids);
  const report = buildCompanyReport(
    { ...input, cursor: undefined },
    page,
    context,
    asOf,
    labels,
    [],
  );
  report.scope = 'all-selected';
  report.page.partial = false;
  report.page.limit = 2000;
  report.warnings = completeReportWarnings(report.warnings);
  report.warnings.push(
    'Totais completos da seleção dentro dos limites operacionais; nenhum subtotal de primeira página.',
  );
  const topics = await repository.readTopics([
    ...new Set(report.intervals.map((r) => r.projectId)),
  ]);
  const breakdown = buildTopicBreakdown(
    page.records,
    report.intervals,
    new Map(Object.entries(topics).map(([id, topics]) => [id, { topics }])),
    labels,
  );
  report.byTopic = breakdown.byTopic;
  report.unassignedMinutes = breakdown.unassignedMinutes;
  report.warnings = [...new Set([...report.warnings, ...breakdown.warnings])];
  return report;
}
