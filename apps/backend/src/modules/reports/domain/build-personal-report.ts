import {
  globalEstimates,
  recordKey,
  assertContext,
} from './global-estimates.js';
import type {
  PersonalReport,
  PersonalReportInput,
  PersonalReportPage,
} from './personal-report.js';
const M = 60000;
export function buildPersonalReport(
  input: PersonalReportInput,
  page: PersonalReportPage,
  asOf: number,
  context: import('./project-report.js').ReportSourceRecord[],
): PersonalReport {
  assertContext(page.records, context);
  const from = input.from ? Date.parse(input.from) : -Infinity,
    to = input.to ? Date.parse(input.to) : Infinity,
    warnings = new Set<string>([
      'Política personal-v3: orçamento global8h pessoa/dia America/Sao_Paulo allprojects/full-context, saldo cronológico start/id e próximo início próprio no mesmo projeto; fechados menores que15min ignorados como corte.',
      'Estimativas não persistidas; fatos fechados preservados. Intervalos são recortados somente para visualização no período.',
      'Sobreposições são somadas; interrupções não são descontadas automaticamente.',
    ]);
  const result: PersonalReport = {
    policy: 'personal-v3',
    budgetTimeZone: 'America/Sao_Paulo',
    asOf: new Date(asOf).toISOString(),
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {}),
    timeZone: input.timeZone,
    totalMinutes: 0,
    estimatedCount: 0,
    byProject: [],
    intervals: [],
    warnings: [],
    page: {
      limit: input.limit ?? 200,
      scannedCount: page.scannedCount,
      excludedCount: 0,
      nextCursor: page.nextCursor,
      partial: Boolean(input.cursor || page.nextCursor),
    },
  };
  if (result.page.partial)
    warnings.add(
      'Página parcial: não representa todo o período nem todos os registros do usuário.',
    );
  const records = [...page.records].sort(
      (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
    ),
    global = globalEstimates(context, asOf),
    projects = new Map<string, number>();
  for (const warning of global.warnings) warnings.add(warning);
  for (const record of records) {
    const start = Date.parse(record.startedAt);
    let end =
      record.endedAt === undefined ? undefined : Date.parse(record.endedAt);
    if (
      !Number.isFinite(start) ||
      (end !== undefined && (!Number.isFinite(end) || end < start))
    ) {
      result.page.excludedCount++;
      warnings.add('Datas inválidas excluídas.');
      continue;
    }
    const estimated = end === undefined;
    if (estimated) end = global.ends.get(recordKey(record));
    const effectiveStart = Math.max(start, from),
      effectiveEnd = Math.min(end ?? start, to);
    if (effectiveEnd <= effectiveStart) {
      result.page.excludedCount++;
      continue;
    }
    if (
      result.intervals.some(
        (r) =>
          Date.parse(r.effectiveStartedAt) < effectiveEnd &&
          Date.parse(r.effectiveEndedAt) > effectiveStart,
      )
    )
      warnings.add('Há intervalos sobrepostos no período.');
    const minutes = (effectiveEnd - effectiveStart) / M;
    result.intervals.push({
      id: record.id,
      projectId: record.projectId,
      startedAt: record.startedAt,
      ...(record.endedAt ? { endedAt: record.endedAt } : {}),
      effectiveStartedAt: new Date(effectiveStart).toISOString(),
      effectiveEndedAt: new Date(effectiveEnd).toISOString(),
      estimated,
      minutes,
    });
    if (estimated) result.estimatedCount++;
    result.totalMinutes += minutes;
    projects.set(
      record.projectId,
      (projects.get(record.projectId) ?? 0) + minutes,
    );
  }
  result.byProject = [...projects].map(([projectId, minutes]) => ({
    projectId,
    minutes,
  }));
  result.warnings = [...warnings];
  return result;
}
