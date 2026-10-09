import type { ProjectReport, ReportPage } from './project-report.js';
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
  assertContext(page.records, context);
  const warnings = new Set<string>();
  warnings.add(
    'Orçamento estimado global de8h por pessoa/dia America/Sao_Paulo: todos projetos e páginas, saldo cronológico start/id; fatos preservados e descontados.',
  );
  if (hasCursor || page.nextCursor)
    warnings.add(
      'Totais representam somente esta página; estimativas usam contexto global completo e próximo início próprio entre projetos.',
    );
  warnings.add(
    'Estimativas não persistidas; interrupções e sobreposições não são descontadas automaticamente.',
  );
  const result: ProjectReport = {
    projectId,
    asOf: new Date(asOf).toISOString(),
    policy: 'project-report-v2',
    budgetTimeZone: 'America/Sao_Paulo',
    totalMinutes: 0,
    byUser: [],
    byTopic: [],
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
  const users = new Map<string, number>(),
    topics = new Map<string, number>();
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
    const allocated: { topicId: string; minutes: number }[] = [];
    for (const topic of record.topics) {
      let value: number | undefined;
      if (
        topic.durationMinutes !== undefined &&
        Number.isFinite(topic.durationMinutes) &&
        topic.durationMinutes > 0
      )
        value = topic.durationMinutes;
      else if (
        topic.percentage !== undefined &&
        Number.isFinite(topic.percentage) &&
        topic.percentage > 0 &&
        topic.percentage <= 100
      )
        value = (minutes * topic.percentage) / 100;
      if (topic.durationMinutes !== undefined && topic.percentage !== undefined)
        warnings.add(
          'Tópico com duração e percentual: duração informada tem precedência.',
        );
      if (value !== undefined)
        allocated.push({ topicId: topic.topicId, minutes: value });
    }
    if (
      record.topics.length === 1 &&
      allocated.length === 0 &&
      record.topics[0]
    )
      allocated.push({ topicId: record.topics[0].topicId, minutes });
    const sum = allocated.reduce((total, topic) => total + topic.minutes, 0);
    if (sum > minutes)
      warnings.add(
        'Distribuições informadas excedem o intervalo; foram preservadas sem normalização.',
      );
    if (sum < minutes)
      allocated.push({ topicId: '__unallocated__', minutes: minutes - sum });
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
    for (const topic of allocated)
      topics.set(
        topic.topicId,
        (topics.get(topic.topicId) ?? 0) + topic.minutes,
      );
  }
  result.byUser = [...users].map(([uid, minutes]) => ({
    uid,
    label: labels[uid] || uid,
    minutes,
  }));
  result.byTopic = [...topics].map(([topicId, minutes]) => ({
    topicId,
    label:
      topicId === '__unallocated__'
        ? 'Não distribuído'
        : page.topicLabels[topicId] || topicId,
    minutes,
  }));
  result.warnings = [...warnings];
  return result;
}
