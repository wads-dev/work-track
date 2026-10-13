import { text } from '../../shared/data';
import { isHidden, safeProject } from '../../shared/ui/privacy';

export type ReportTopic =
  import('@work-track/core/reports/domain/topic-breakdown').TopicBreakdown['byTopic'][number];
export type TopicReportBucket = {
  projectId: string;
  topicId: string | null;
  projectLabel: string;
  topicLabel: string;
  minutes: number;
  detailsAvailable?: boolean;
  people: { key: string; label: string; minutes: number; uid?: string }[];
};
export const topicBucketKey = (
  bucket: Pick<TopicReportBucket, 'projectId' | 'topicId'>,
) => JSON.stringify([bucket.projectId, bucket.topicId]);

/** Derived computation, NOT a retrieval-filter exception: buckets/byUser are
 * domain allocations computed from a complete authorized report, not stored
 * Firestore rows. Retrieval predicates belong to the native report repository.
 * Personal byUser validation defends against incompatible aggregate payloads;
 * dropping foreign identities never recalculates the report's global totals or
 * its full-context estimates. Confidentiality masks project/topic metadata only,
 * never a person's identity, even when the associated project is concealed. */
export function topicBuckets(
  topics: ReportTopic[],
  project: (id: string) => Record<string, unknown> | undefined,
  revealed: boolean,
  personalUid?: string,
): TopicReportBucket[] {
  return topics.map((topic) => {
    const metadata = project(topic.projectId);
    const hidden = isHidden(metadata, revealed);
    return {
      projectId: topic.projectId,
      topicId: topic.topicId,
      detailsAvailable: !hidden,
      projectLabel: text(
        safeProject(metadata, revealed).title,
        'Projeto reservado',
      ),
      topicLabel: hidden ? 'Tópico reservado' : text(topic.label, 'Tópico'),
      minutes: topic.minutes,
      people: (topic.byUser ?? [])
        .filter(
          (person) =>
            personalUid === undefined ||
            (Boolean(personalUid) && person.uid === personalUid),
        )
        .map((person, index) => ({
          key: String(index),
          uid: person.uid,
          label:
            personalUid !== undefined ? 'Você' : text(person.label, 'Pessoa'),
          minutes: person.minutes,
        })),
    };
  });
}

/** Select a computed allocation bucket for drilldown, not persisted records.
 * The complete bucket collection and all allocation values remain untouched. */
export function selectTopicReportBuckets(
  buckets: TopicReportBucket[],
  selected: string,
) {
  const active = new Map(
    buckets.map((bucket) => [topicBucketKey(bucket), bucket]),
  ).get(selected);
  return { active, visibleBuckets: active ? [active] : buckets };
}

/** Four-week viewport over computed occupied-week keys, NOT database pagination.
 * These keys/occurrence counts are derived from the complete historical report.
 * Do not clip record intervals, recompute totals or recalculate open estimates:
 * the calendar receives its original complete items and clips rendering geometry.
 * No stored-dataset retrieval filter is replaced by this computation. */
export function selectCalendarHistoryPage(
  weeks: readonly string[],
  occurrences: readonly { week: string; occurrenceCount: number }[],
  rawPage: number,
) {
  const pages = Math.max(1, Math.ceil(weeks.length / 4));
  const page =
    Number.isInteger(rawPage) && rawPage >= 0
      ? Math.min(rawPage, pages - 1)
      : 0;
  const counts = new Map(
    occurrences.map((item) => [item.week, item.occurrenceCount]),
  );
  return {
    totalWeeks: weeks.length,
    pages,
    page,
    weeks: weeks.slice(page * 4, page * 4 + 4).map((week) => ({
      week,
      occurrenceCount: counts.get(week) ?? 0,
    })),
  };
}
