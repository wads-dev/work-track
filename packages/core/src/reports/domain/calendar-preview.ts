import type { ReportSourceRecord } from './project-report.js';
/** Display projection only: sources already selected and revalidated by repositories.
 * Open records use now for display until contextual estimates arrive; never persist an end. */
export function calendarPreview(
  records: readonly ReportSourceRecord[],
  from: string,
  to: string,
  zone: string,
  now: number,
) {
  const projects = new Set<string>();
  const intervals = records.flatMap((record) => {
    const started = Date.parse(record.startedAt);
    const open = !record.endedAt;
    const start = Math.max(started, from ? Date.parse(from) : -Infinity);
    const end = open
      ? Math.max(started, Math.min(now, to ? Date.parse(to) : Infinity))
      : Math.min(Date.parse(record.endedAt!), to ? Date.parse(to) : Infinity);
    if (
      open ? started < start || (to && started >= Date.parse(to)) : end <= start
    )
      return [];
    projects.add(record.projectId);
    return [
      {
        id: record.id,
        uid: record.uid,
        projectId: record.projectId,
        startedAt: record.startedAt,
        ...(record.endedAt ? { endedAt: record.endedAt } : {}),
        effectiveStartedAt: new Date(open ? started : start).toISOString(),
        effectiveEndedAt: new Date(end).toISOString(),
        estimated: open,
        minutes: 0,
        loggedMinutes: open ? undefined : (end - start) / 60000,
        calculationPending: true,
        readOnly: true,
        topics: [],
      },
    ];
  });
  return {
    policy: 'calendar-preview',
    budgetTimeZone: zone,
    asOf: new Date(now).toISOString(),
    from,
    to,
    timeZone: zone,
    totalMinutes: 0,
    estimatedCount: 0,
    byProject: [...projects].map((projectId) => ({ projectId, minutes: 0 })),
    intervals,
    warnings: [],
    byTopic: [],
    unassignedMinutes: 0,
    page: {
      limit: 2000,
      scannedCount: records.length,
      excludedCount: 0,
      nextCursor: null,
      partial: false,
    },
    calculationPending: true,
  };
}
