import { activeRecords } from '../../registration/domain/record-lifecycle.js';
import type { ProjectReport, ReportPage } from './project-report.js';
import { buildTopicBreakdown } from './topic-breakdown.js';
import { recordKey, assertContext } from './global-estimates.js';
export { localDay, nextMidnight } from './report-time.js';
import { buildTimeAccounting, accountedMinutes } from './accounted-time.js';
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
    'Estimativas sem teto diário: até agora e no máximo6h por registro aberto, com corte por meia-noite; horários originais preservados.',
  );
  if (hasCursor || page.nextCursor)
    warnings.add(
      'Totais representam somente esta página; rateio e estimativas usam contexto autorizado completo antes da paginação.',
    );
  warnings.add(
    'Estimativas e rateio não persistidos; sobreposições divididas igualmente por pessoa; interrupções não descontadas automaticamente.',
  );
  const result: ProjectReport = {
    projectId,
    asOf: new Date(asOf).toISOString(),
    policy: 'project-report-v4',
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
  const global = buildTimeAccounting(context, asOf);
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
    const segments = global.segments(record, start, effectiveEnd),
      loggedMinutes = Math.max(0, (effectiveEnd - start) / 60000),
      minutes = accountedMinutes(segments);
    if (
      result.records.some(
        (other) =>
          other.uid === record.uid &&
          Date.parse(other.startedAt) < effectiveEnd &&
          Date.parse(other.effectiveEndedAt) > start,
      )
    )
      warnings.add(
        'Há sobreposições por usuário; minutos divididos igualmente por trecho.',
      );
    const breakdown = buildTopicBreakdown(
      page.records,
      [{ ...record, minutes, loggedMinutes }],
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
      loggedMinutes,
      accountingSegments: segments,
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
