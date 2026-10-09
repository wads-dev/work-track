import { localDay, nextMidnight } from './build-project-report.js';
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
): PersonalReport {
  const from = Date.parse(input.from),
    to = Date.parse(input.to),
    warnings = new Set<string>([
      'Política personal-v1: próximo início do próprio usuário em qualquer projeto; contexto e orçamento diário de 8h limitados à página lida.',
      'Estimativas não persistidas; fatos fechados preservados. Intervalos são recortados somente para visualização no período.',
      'Sobreposições são somadas; interrupções não são descontadas automaticamente.',
    ]);
  const result: PersonalReport = {
    policy: 'personal-v1',
    asOf: new Date(asOf).toISOString(),
    from: input.from,
    to: input.to,
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
    used = new Map<string, number>(),
    projects = new Map<string, number>();
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
    if (estimated) {
      try {
        const next = records.find(
          (other) =>
            other.uid === record.uid && Date.parse(other.startedAt) > start,
        );
        end = Math.max(
          start,
          Math.min(
            asOf,
            start + 240 * M,
            nextMidnight(start, record.timeZone),
            nextMidnight(start, input.timeZone),
            next ? Date.parse(next.startedAt) : Infinity,
          ),
        );
        if (record.timeZone !== input.timeZone)
          warnings.add(
            'Estimativas também limitadas à meia-noite do fuso do relatório para respeitar orçamento diário.',
          );
        // Daily budget uses the requested report timezone consistently across projects.
        const day = localDay(start, input.timeZone),
          dayEnd = nextMidnight(start, input.timeZone);
        let low = start - 48 * 60 * M,
          high = start;
        while (high - low > 1) {
          const mid = Math.floor((low + high) / 2);
          if (localDay(mid, input.timeZone) === day) high = mid;
          else low = mid;
        }
        const closed = records
          .filter((r) => r.endedAt !== undefined)
          .reduce((sum, r) => {
            const a = Date.parse(r.startedAt),
              b = Date.parse(r.endedAt ?? '');
            return (
              sum +
              (Number.isFinite(a) && Number.isFinite(b) && b >= a
                ? Math.max(0, Math.min(b, dayEnd) - Math.max(a, high)) / M
                : 0)
            );
          }, 0);
        end = Math.min(
          end,
          start + Math.max(0, 480 - closed - (used.get(day) ?? 0)) * M,
        );
        used.set(day, (used.get(day) ?? 0) + (end - start) / M);
      } catch {
        result.page.excludedCount++;
        warnings.add('Fuso inválido em registro aberto; excluído.');
        continue;
      }
    }
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
