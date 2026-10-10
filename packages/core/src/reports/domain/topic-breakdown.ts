import {
  activeRecords,
  isDeletedRecord,
} from '../../registration/domain/record-lifecycle.js';
import type { ReportSourceRecord } from './project-report.js';

export type TopicMetadata = {
  id: string;
  title: string;
  mergedIntoTopicId?: string;
};
type TopicInterval = {
  id: string;
  uid: string;
  projectId: string;
  minutes: number;
};
export type TopicBreakdown = {
  byTopic: {
    projectId: string;
    topicId: string;
    label: string;
    minutes: number;
    byUser: { uid: string; label: string; minutes: number }[];
  }[];
  unassignedMinutes: number;
  warnings: string[];
};
type Resolution =
  { topicId: string; label: string; warning?: string } | { error: string };

const UNKNOWN_TOPIC = 'Tópico sem identificação';
const UNKNOWN_USER = 'Participante sem nome';
const MAX_ALIAS_CHAIN = 200;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sourceKey = (record: Pick<TopicInterval, 'id' | 'uid' | 'projectId'>) =>
  JSON.stringify([record.projectId, record.uid, record.id]);
const positiveFinite = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0;

export function resolveTopic(
  topics: Map<string, TopicMetadata | null>,
  originalId: string,
): Resolution {
  if (!originalId.trim()) return { error: 'ID de tópico vazio' };
  const visited = new Set<string>();
  let current = originalId;
  while (visited.size < MAX_ALIAS_CHAIN) {
    if (visited.has(current)) return { error: 'Ciclo de aliases de tópicos' };
    visited.add(current);
    const topic = topics.get(current);
    if (topic === null) return { error: 'Metadados de tópico duplicados' };
    if (topic === undefined) {
      // A missing historical original is still a stable technical identity.
      // A missing alias target is not evidence of a canonical identity.
      return current === originalId
        ? {
            topicId: originalId,
            label: UNKNOWN_TOPIC,
            warning: 'Tópico histórico ausente dos metadados',
          }
        : { error: 'Destino de alias ausente dos metadados' };
    }
    if (topic.mergedIntoTopicId === undefined)
      return {
        topicId: current,
        label: topic.title.trim() ? topic.title : UNKNOWN_TOPIC,
      };
    current = topic.mergedIntoTopicId;
  }
  return { error: 'Cadeia de aliases excede o limite de 200 tópicos' };
}

/** Attribute only supplied intervals; no estimates or source mutations occur here. */
export function buildTopicBreakdown(
  records: ReportSourceRecord[],
  intervals: TopicInterval[],
  catalog: Map<string, { topics: TopicMetadata[] }>,
  labels: Record<string, string> = {},
): TopicBreakdown {
  const deletedKeys = new Set(records.filter(isDeletedRecord).map(sourceKey));
  records = activeRecords(records);
  intervals = activeRecords(intervals).filter(
    (interval) => !deletedKeys.has(sourceKey(interval)),
  );
  const warnings = new Set<string>();
  const sources = new Map<string, ReportSourceRecord | null>();
  for (const record of records) {
    const key = sourceKey(record);
    sources.set(key, sources.has(key) ? null : record);
  }
  const metadata = new Map<string, Map<string, TopicMetadata | null>>();
  for (const [projectId, project] of catalog) {
    const topics = new Map<string, TopicMetadata | null>();
    for (const topic of project.topics)
      topics.set(topic.id, topics.has(topic.id) ? null : topic);
    metadata.set(projectId, topics);
  }
  const totals = new Map<
    string,
    {
      projectId: string;
      topicId: string;
      label: string;
      minutes: number;
      users: Map<string, number>;
    }
  >();
  let unassignedMinutes = 0;
  const ordered = [...intervals].sort(
    (a, b) =>
      compare(a.projectId, b.projectId) ||
      compare(a.id, b.id) ||
      compare(a.uid, b.uid) ||
      compare(String(a.minutes), String(b.minutes)),
  );
  for (const interval of ordered) {
    const context =
      'Registro ' +
      JSON.stringify(interval.id) +
      ' do projeto ' +
      JSON.stringify(interval.projectId);
    const warn = (message: string) =>
      warnings.add(context + ': ' + message + '.');
    if (!Number.isFinite(interval.minutes) || interval.minutes < 0) {
      warn('Intervalo com minutos inválidos excluído do cálculo');
      continue;
    }
    const record = sources.get(sourceKey(interval));
    if (!record) {
      unassignedMinutes += interval.minutes;
      warn(
        record === null
          ? 'Fonte duplicada para UID, ID e projeto; intervalo inteiro sem distribuição'
          : 'Fonte ausente para UID, ID e projeto; intervalo inteiro sem distribuição',
      );
      continue;
    }
    const topics = metadata.get(interval.projectId);
    if (!topics) {
      unassignedMinutes += interval.minutes;
      warn('Metadados do projeto ausentes; intervalo inteiro sem distribuição');
      continue;
    }
    const allocations: { originalId: string; minutes: number }[] = [];
    for (const topic of record.topics) {
      const duration = positiveFinite(topic.durationMinutes)
        ? topic.durationMinutes
        : undefined;
      const percentage =
        positiveFinite(topic.percentage) && topic.percentage <= 100
          ? topic.percentage
          : undefined;
      if (topic.durationMinutes !== undefined && topic.percentage !== undefined)
        warn(
          'Tópico ' +
            JSON.stringify(topic.topicId) +
            ' com duração e percentual: duração válida tem precedência, senão percentual válido',
        );
      if (
        (topic.durationMinutes !== undefined && duration === undefined) ||
        (topic.percentage !== undefined && percentage === undefined)
      )
        warn(
          'Tópico ' +
            JSON.stringify(topic.topicId) +
            ' com alocação inválida ignorada',
        );
      let minutes: number | undefined;
      if (duration !== undefined) minutes = duration;
      else if (percentage !== undefined)
        minutes = interval.minutes * (percentage / 100);
      else if (
        record.topics.length === 1 &&
        topic.durationMinutes === undefined &&
        topic.percentage === undefined
      )
        minutes = interval.minutes;
      if (minutes !== undefined)
        allocations.push({ originalId: topic.topicId, minutes });
    }
    const sum = allocations.reduce((total, topic) => total + topic.minutes, 0);
    if (sum > interval.minutes) {
      unassignedMinutes += interval.minutes;
      warn(
        'Alocações excedem o intervalo; intervalo inteiro sem distribuição, sem normalização ou truncamento',
      );
      continue;
    }
    const resolved: { topicId: string; label: string; minutes: number }[] = [];
    const originals = new Map<string, string[]>();
    for (const allocation of allocations) {
      const resolution = resolveTopic(topics, allocation.originalId);
      if ('error' in resolution) {
        warn(
          'Tópico original ' +
            JSON.stringify(allocation.originalId) +
            ': ' +
            resolution.error +
            '; alocação sem distribuição',
        );
        continue;
      }
      if (resolution.warning)
        warn(
          'Tópico original ' +
            JSON.stringify(allocation.originalId) +
            ': ' +
            resolution.warning +
            '; identidade original preservada',
        );
      const ids = originals.get(resolution.topicId) ?? [];
      ids.push(allocation.originalId);
      originals.set(resolution.topicId, ids);
      resolved.push({
        topicId: resolution.topicId,
        label: resolution.label,
        minutes: allocation.minutes,
      });
    }
    const collisions = [...originals].filter(([, ids]) => ids.length > 1);
    if (collisions.length > 0) {
      unassignedMinutes += interval.minutes;
      for (const [topicId, ids] of collisions)
        warn(
          'Alocações dos tópicos originais ' +
            JSON.stringify([...ids].sort(compare)) +
            ' convergem para ' +
            JSON.stringify(topicId) +
            '; intervalo inteiro sem distribuição, sem combinar originais',
        );
      continue;
    }
    if (allocations.length === 0 && record.topics.length > 1)
      warn(
        'Vários tópicos sem alocação válida: distribuição ambígua, intervalo inteiro sem distribuição',
      );
    const attributed = resolved.reduce(
      (total, topic) => total + topic.minutes,
      0,
    );
    unassignedMinutes += interval.minutes - attributed;
    for (const topic of resolved) {
      if (topic.minutes === 0) continue;
      const key = JSON.stringify([interval.projectId, topic.topicId]);
      const total = totals.get(key) ?? {
        projectId: interval.projectId,
        topicId: topic.topicId,
        label: topic.label,
        minutes: 0,
        users: new Map<string, number>(),
      };
      total.minutes += topic.minutes;
      total.users.set(
        interval.uid,
        (total.users.get(interval.uid) ?? 0) + topic.minutes,
      );
      totals.set(key, total);
    }
  }
  return {
    byTopic: [...totals.values()]
      .sort(
        (a, b) =>
          compare(a.projectId, b.projectId) || compare(a.topicId, b.topicId),
      )
      .map((topic) => ({
        projectId: topic.projectId,
        topicId: topic.topicId,
        label: topic.label,
        minutes: topic.minutes,
        byUser: [...topic.users]
          .sort(([a], [b]) => compare(a, b))
          .map(([uid, minutes]) => {
            const label = Object.hasOwn(labels, uid) ? labels[uid] : undefined;
            return {
              uid,
              label: label?.trim() ? label : UNKNOWN_USER,
              minutes,
            };
          }),
      })),
    unassignedMinutes,
    warnings: [...warnings].sort(compare),
  };
}
