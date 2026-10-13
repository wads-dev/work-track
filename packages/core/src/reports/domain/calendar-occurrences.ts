import type { ReportSourceRecord } from './project-report.js';
import type { PersonalReport } from './personal-report.js';
import { calendarTopics } from './calendar-topics.js';
import type { TopicMetadata } from './topic-breakdown.js';
import { calendarWeekAt } from './calendar-weeks.js';
import { globalEstimates, recordKey } from './global-estimates.js';

type Bounds = { from?: string; to?: string; timeZone: string };
/** Join calculated intervals with already repository-selected canonical source facts.
 * No dataset selection: every interval is preserved; membership is allocation math. */
export function calendarIntervalMembership(
  intervals: (PersonalReport['intervals'][number] & { uid?: string })[],
  selected: ReportSourceRecord[],
  uid: string,
  topics: Record<string, TopicMetadata[]>,
  selectedTopic?: string,
) {
  const sources = new Map(
    selected.map((r) => [r.uid + '/' + r.projectId + '/' + r.id, r]),
  );
  const warnings = new Set<string>();
  const result = intervals.map((r) => {
    const authorUid = r.uid ?? uid,
      source = sources.get(authorUid + '/' + r.projectId + '/' + r.id);
    if (!source) throw new Error('Fonte do intervalo indisponível.');
    const membership = calendarTopics(
      source,
      r.minutes,
      topics[r.projectId] ?? [],
    );
    for (const w of membership.warnings) warnings.add(w);
    const subject = new Map(membership.topics.map((t) => [t.topicId, t])).get(
      selectedTopic ?? '',
    );
    return {
      ...r,
      uid: authorUid,
      readOnly: authorUid !== uid,
      topics: membership.topics,
      ...(subject?.assignedMinutes !== undefined
        ? { subjectAssignedMinutes: subject.assignedMinutes }
        : {}),
    };
  });
  return { intervals: result, warnings };
}
/** Warning text composition, not record selection. */
export function completeReportWarnings(warnings: string[]) {
  return warnings.filter((w) => !w.includes('página selecionada'));
}
/** Projection math on repository-selected sources, not source dataset selection.
 * Zero-duration open points carry no hours and must not duplicate engine intervals.
 */
export function zeroDurationOpenOccurrences(
  selected: ReportSourceRecord[],
  context: ReportSourceRecord[],
  asOf: number,
  bounds: Bounds,
  intervals: (PersonalReport['intervals'][number] & { uid?: string })[],
) {
  const estimates = globalEstimates(context, asOf);
  return selected
    .filter((r) => {
      const start = Date.parse(r.startedAt);
      return (
        r.endedAt === undefined &&
        Number.isFinite(start) &&
        estimates.ends.get(recordKey(r)) === start &&
        (!bounds.from || start >= Date.parse(bounds.from)) &&
        (!bounds.to || start < Date.parse(bounds.to)) &&
        !intervals.some(
          (i) =>
            i.id === r.id &&
            i.projectId === r.projectId &&
            (i.uid === undefined || i.uid === r.uid),
        )
      );
    })
    .map((r) => ({
      id: r.id,
      uid: r.uid,
      projectId: r.projectId,
      startedAt: r.startedAt,
      effectiveStartedAt: new Date(Date.parse(r.startedAt)).toISOString(),
      effectiveEndedAt: new Date(Date.parse(r.startedAt)).toISOString(),
      estimated: true,
      minutes: 0,
    }));
}
/** A selected spanning interval occupies several weeks, but its actual start
 * contributes one occurrence in its own civil week, never a fabricated later start.
 */
export function calendarOccurrenceCounts(
  selected: ReportSourceRecord[],
  bounds: Bounds,
) {
  const counts = new Map<string, number>();
  for (const record of selected) {
    const start = Date.parse(record.startedAt);
    const end =
      record.endedAt === undefined ? undefined : Date.parse(record.endedAt);
    if (
      !Number.isFinite(start) ||
      (end !== undefined && (!Number.isFinite(end) || end < start)) ||
      (bounds.from && start < Date.parse(bounds.from)) ||
      (bounds.to && start >= Date.parse(bounds.to))
    )
      continue;
    const week = calendarWeekAt(start, bounds.timeZone);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return counts;
}
