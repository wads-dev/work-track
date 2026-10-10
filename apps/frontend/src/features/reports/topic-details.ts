import type {
  TopicFacts,
  TopicDetailReport,
} from '@work-track/core/contracts/report-responses';
export type {
  TopicFacts,
  TopicDetailReport,
} from '@work-track/core/contracts/report-responses';
export function validateTopicReport(
  data: TopicDetailReport,
  uid: string,
  projectId: string,
  requestedTopicId: string,
  canonicalTopicId: string,
) {
  const fail = () => {
    throw new Error('Relatório de tópico incompleto ou incompatível.');
  };
  if (
    data.policy !== 'topic-report-v3' ||
    data.scope !== 'all-selected' ||
    data.viewerUid !== uid ||
    data.projectId !== projectId ||
    data.requestedTopicId !== requestedTopicId ||
    data.topicId !== canonicalTopicId ||
    !['own', 'global'].includes(data.mode) ||
    data.page?.partial !== false ||
    data.page.nextCursor !== null ||
    !Array.isArray(data.participants) ||
    !Array.isArray(data.intervals)
  )
    fail();
  const facts = (f: TopicFacts) => {
    if (!Number.isSafeInteger(f.occurrenceCount) || f.occurrenceCount < 0)
      fail();
    if (f.occurrenceCount === 0) {
      if (f.firstRecordStartedAt !== null || f.lastRecordStartedAt !== null)
        fail();
    } else if (
      !Number.isFinite(Date.parse(f.firstRecordStartedAt ?? '')) ||
      !Number.isFinite(Date.parse(f.lastRecordStartedAt ?? '')) ||
      Date.parse(f.firstRecordStartedAt!) > Date.parse(f.lastRecordStartedAt!)
    )
      fail();
  };
  facts(data);
  for (const n of [
    data.totalMinutes,
    data.closedMinutes,
    data.estimatedMinutes,
    data.fullRecordMinutes,
    data.unassignedMinutes,
  ])
    if (!Number.isFinite(n) || n < 0) fail();
  const seen = new Set<string>();
  for (const p of data.participants) {
    facts(p);
    if (seen.has(p.uid) || !p.uid || (data.mode === 'own' && p.uid !== uid))
      fail();
    seen.add(p.uid);
    for (const n of [
      p.assignedMinutes,
      p.closedMinutes,
      p.estimatedMinutes,
      p.fullRecordMinutes,
    ])
      if (!Number.isFinite(n) || n < 0) fail();
  }
  return data;
}
export function canonicalCatalogTopic(
  topics: Record<string, unknown>[],
  requested: string,
): string | null {
  let id = requested;
  const seen = new Set<string>();
  for (let n = 0; n < 200; n++) {
    if (seen.has(id)) return null;
    seen.add(id);
    const topic = topics.find((t) => t.id === id);
    if (!topic) return null;
    if (!topic.mergedIntoTopicId) return id;
    if (typeof topic.mergedIntoTopicId !== 'string') return null;
    id = topic.mergedIntoTopicId;
  }
  return null;
}
