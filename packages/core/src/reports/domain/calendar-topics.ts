import {
  buildTopicBreakdown,
  resolveTopic,
  type TopicMetadata,
} from './topic-breakdown.js';
import type { ReportSourceRecord } from './project-report.js';
export function topicMetadataMap(topics: TopicMetadata[]) {
  const map = new Map<string, TopicMetadata | null>();
  for (const topic of topics)
    map.set(topic.id, map.has(topic.id) ? null : topic);
  return map;
}
/** Membership is independent of allocation: ambiguous/zero shares still identify occurrences. */
export function calendarTopics(
  record: ReportSourceRecord,
  minutes: number,
  topics: TopicMetadata[],
) {
  const map = topicMetadataMap(topics),
    members = new Map<
      string,
      { topicId: string; label: string; assignedMinutes?: number }
    >(),
    warnings: string[] = [];
  for (const original of record.topics) {
    const resolved = resolveTopic(map, original.topicId);
    if ('error' in resolved) {
      warnings.push(resolved.error);
      continue;
    }
    members.set(resolved.topicId, {
      topicId: resolved.topicId,
      label: resolved.label,
    });
    if (resolved.warning) warnings.push(resolved.warning);
  }
  const allocation = buildTopicBreakdown(
    [record],
    [{ id: record.id, uid: record.uid, projectId: record.projectId, minutes }],
    new Map([[record.projectId, { topics }]]),
  );
  for (const topic of allocation.byTopic) {
    const member = members.get(topic.topicId);
    if (member) member.assignedMinutes = topic.minutes;
  }
  return {
    topics: [...members.values()],
    warnings: [...new Set([...warnings, ...allocation.warnings])],
  };
}
