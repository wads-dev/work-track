import { activeRecords } from '../../registration/domain/record-lifecycle.js';
import type { ProjectReport, ReportPage } from './project-report.js';
import { buildTopicBreakdown } from './topic-breakdown.js';
import {
  globalEstimates,
  recordKey,
  assertContext,
} from './global-estimates.js';
export { localDay, nextMidnight } from './report-time.js';
const MINUTE = 60000;
export function buildProjectReport(
  projectId: string,
  page: ReportPage,
  limit: number,
  asOf: number,
  labels: Record<string, string>,
  hasCursor = false,
  context: import('./project-report.js').ReportSourceRecord[],
): ProjectReport {
  page = { ...page, records: activeRecords(page.records) };
  context = activeRecords(context);
  assertContext(page.records, context);
  const warnings = new Set<string>();
  warnings.add(
    'Orçamento estimado global de8h por pessoa/dia America/Sao_Paulo: todos projetos e páginas, saldo cronológico start/id; fatos preservados e descontados.',
  );
  if (hasCursor || page.nextCursor)
    warnings.add(
      'Totais representam somente esta página; estimativas usam contexto global completo e próximo início próprio no mesmo projeto; fechados menores que15min ignorados como corte.',
    );
  warnings.add(
    'Estimativas não persistidas; interrupções e sobreposições não são descontadas automaticamente.',
  );
  const result: ProjectReport = {
    projectId,
    asOf: new Date(asOf).toISOString(),
    policy: 'project-report-v3',
    budgetTimeZone: 'America/Sao_Paulo',
    totalMinutes: 0,
    byUser: [],
    byTopic: [],
    unassignedMinutes: 0,
    records: [],
    estimatedCount: 0,
    warnings: [],
    page: {
      limit,
      nextCursor: page.nextCursor,
      partial: hasCursor || page.nextCursor !== null,
    },
  };
  const global = globalEstimates(context, asOf);
  for (const warning of global.warnings) warnings.add(warning);
  const users = new Map<string, number>();
  const catalog = new Map([
    [
      projectId,
      {
        topics:
          page.topics ??
          Object.entries(page.topicLabels).map(([id, title]) => ({
            id,
            title,
          })),
      },
    ],
  ]);
  const source = [...page.records].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );
  for (const record of source) {
    const start = Date.parse(record.startedAt);
    let end =
      record.endedAt === undefined ? undefined : Date.parse(record.endedAt);
    if (
      !Number.isFinite(start) ||
      (end !== undefined && (!Number.isFinite(end) || end < start))
    ) {
      warnings.add('Registros com datas inválidas foram excluídos do cálculo.');
      continue;
    }
    const estimated = end === undefined;
    if (estimated) {
      end = global.ends.get(recordKey(record));
      result.estimatedCount++;
    }
    const effectiveEnd = end ?? start;
    const minutes = Math.max(0, (effectiveEnd - start) / MINUTE);
    if (
      result.records.some(
        (other) =>
          other.uid === record.uid &&
          Date.parse(other.startedAt) < effectiveEnd &&
          Date.parse(other.effectiveEndedAt) > start,
      )
    )
      warnings.add(
        'Há sobreposições por usuário; intervalos são somados sem inferir troca ou simultaneidade.',
      );
    const breakdown = buildTopicBreakdown(
      page.records,
      [{ ...record, minutes }],
      catalog,
      labels,
    );
    const allocated = breakdown.byTopic.map((topic) => ({
      topicId: topic.topicId,
      minutes: topic.minutes,
    }));
    for (const warning of breakdown.warnings) warnings.add(warning);
    result.records.push({
      id: record.id,
      uid: record.uid,
      projectId: record.projectId,
      startedAt: record.startedAt,
      ...(record.endedAt === undefined ? {} : { endedAt: record.endedAt }),
      effectiveEndedAt: new Date(effectiveEnd).toISOString(),
      estimated,
      minutes,
      topics: allocated,
    });
    result.totalMinutes += minutes;
    users.set(record.uid, (users.get(record.uid) ?? 0) + minutes);
  }
  result.byUser = [...users].map(([uid, minutes]) => ({
    uid,
    label: labels[uid] || 'Participante sem nome',
    minutes,
  }));
  const breakdown = buildTopicBreakdown(
    page.records,
    result.records,
    catalog,
    labels,
  );
  result.byTopic = breakdown.byTopic;
  result.unassignedMinutes = breakdown.unassignedMinutes;
  for (const warning of breakdown.warnings) warnings.add(warning);
  result.warnings = [...warnings];
  return result;
}
