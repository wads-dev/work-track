import type { CompanyReport, CompanyReportInput } from './company-report.js';
import type { PersonalReportPage } from './personal-report.js';
import type { ReportSourceRecord } from './project-report.js';
import { buildPersonalReport } from './build-personal-report.js';
export function buildCompanyReport(
  input: CompanyReportInput,
  page: PersonalReportPage,
  context: ReportSourceRecord[],
  asOf: number,
  labels: Record<string, string>,
  archived: string[],
): CompanyReport {
  const output: CompanyReport = {
    policy: 'company-v3',
    budgetTimeZone: 'America/Sao_Paulo',
    asOf: new Date(asOf).toISOString(),
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {}),
    timeZone: input.timeZone,
    totalMinutes: 0,
    estimatedCount: 0,
    byProject: [],
    byUser: [],
    intervals: [],
    warnings: [
      'Resumo empresarial referente somente à página selecionada; não equivale a um total global da empresa.',
    ],
    page: {
      limit: input.limit ?? 50,
      scannedCount: page.scannedCount,
      excludedCount: 0,
      nextCursor: page.nextCursor,
      partial: Boolean(input.cursor || page.nextCursor),
    },
  };
  const projects = new Map<string, number>(),
    warnings = new Set(output.warnings),
    hidden = new Set(archived);
  for (const uid of new Set(page.records.map((r) => r.uid))) {
    const own = page.records.filter((r) => r.uid === uid),
      personal = buildPersonalReport(
        input,
        { records: own, scannedCount: own.length, nextCursor: page.nextCursor },
        asOf,
        context.filter((r) => r.uid === uid),
      );
    output.page.excludedCount += personal.page.excludedCount;
    for (const warning of personal.warnings) warnings.add(warning);
    const selected = personal.intervals.filter(
      (r) => input.includeArchived || !hidden.has(r.projectId),
    );
    output.page.excludedCount += personal.intervals.length - selected.length;
    let total = 0;
    for (const interval of selected) {
      output.intervals.push({ ...interval, uid });
      total += interval.minutes;
      output.totalMinutes += interval.minutes;
      if (interval.estimated) output.estimatedCount++;
      projects.set(
        interval.projectId,
        (projects.get(interval.projectId) ?? 0) + interval.minutes,
      );
    }
    if (selected.length)
      output.byUser.push({ uid, label: labels[uid] || uid, minutes: total });
  }
  if (!input.includeArchived)
    warnings.add(
      'Projetos arquivados/ausentes omitidos da visualização; fatos permanecem no orçamento global.',
    );
  output.byProject = [...projects].map(([projectId, minutes]) => ({
    projectId,
    minutes,
  }));
  output.warnings = [...warnings];
  return output;
}
