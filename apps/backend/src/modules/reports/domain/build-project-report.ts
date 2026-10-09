import type { ProjectReport, ReportPage } from './project-report.js';
const MINUTE = 60000;
export function localDay(instant: number, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}
// Find the next local date transition rather than assuming every day is 24h.
export function nextMidnight(instant: number, zone: string): number {
  const day = localDay(instant, zone);
  let low = instant,
    high = instant + 48 * 60 * MINUTE;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localDay(middle, zone) === day) low = middle;
    else high = middle;
  }
  return high;
}
export function buildProjectReport(
  projectId: string,
  page: ReportPage,
  limit: number,
  asOf: number,
  labels: Record<string, string>,
  hasCursor = false,
): ProjectReport {
  const warnings = new Set<string>();
  warnings.add(
    'Limite estimado de 8h por usuário/dia aplica-se apenas ao projeto e à página consultados, não globalmente.',
  );
  if (hasCursor || page.nextCursor)
    warnings.add(
      'Relatório parcial: totais, próximo início e limite diário consideram somente esta página.',
    );
  warnings.add(
    'Estimativas não persistidas; interrupções e sobreposições não são descontadas automaticamente.',
  );
  const result: ProjectReport = {
    projectId,
    asOf: new Date(asOf).toISOString(),
    policy: 'project-report-v1',
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
  const estimatedDaily = new Map<string, number>();
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
      try {
        const next = source.find(
          (other) =>
            other.uid === record.uid &&
            other.projectId === record.projectId &&
            Date.parse(other.startedAt) > start,
        );
        end = Math.max(
          start,
          Math.min(
            start + 240 * MINUTE,
            nextMidnight(start, record.timeZone),
            asOf,
            next ? Date.parse(next.startedAt) : Infinity,
          ),
        );
        const key = record.uid + ':' + localDay(start, record.timeZone);
        let dayStart = start - 48 * 60 * MINUTE,
          right = start;
        const day = localDay(start, record.timeZone);
        while (right - dayStart > 1) {
          const middle = Math.floor((dayStart + right) / 2);
          if (localDay(middle, record.timeZone) === day) right = middle;
          else dayStart = middle;
        }
        const dayEnd = nextMidnight(start, record.timeZone);
        const explicitMinutes = source
          .filter(
            (other) => other.uid === record.uid && other.endedAt !== undefined,
          )
          .reduce((sum, other) => {
            const a = Date.parse(other.startedAt),
              b = Date.parse(other.endedAt ?? '');
            return (
              sum +
              (Number.isFinite(a) && Number.isFinite(b) && b >= a
                ? Math.max(0, Math.min(b, dayEnd) - Math.max(a, right)) / MINUTE
                : 0)
            );
          }, 0);
        const used = (estimatedDaily.get(key) ?? 0) + explicitMinutes;
        end = start + Math.min(end - start, Math.max(0, 480 - used) * MINUTE);
        estimatedDaily.set(
          key,
          (estimatedDaily.get(key) ?? 0) + (end - start) / MINUTE,
        );
        if (start > asOf) {
          warnings.add(
            'Inícios futuros abertos não recebem duração estimada; fim efetivo é o próprio início.',
          );
          end = start;
        }
      } catch {
        warnings.add(
          'Registros abertos com fuso inválido foram excluídos do cálculo.',
        );
        continue;
      }
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
