import { calendarTopics, topicMetadataMap } from './calendar-topics.js';
import { resolveTopic, type TopicMetadata } from './topic-breakdown.js';
import { buildPersonalReport } from './build-personal-report.js';
import type { ReportSourceRecord } from './project-report.js';
import { activeRecords } from '../../registration/domain/record-lifecycle.js';
export function buildTopicDetails(
  projectId: string,
  requestedTopicId: string,
  records: ReportSourceRecord[],
  context: ReportSourceRecord[],
  topics: TopicMetadata[],
  asOf: number,
  viewerUid: string,
  labels: Record<string, string>,
) {
  const resolved = resolveTopic(topicMetadataMap(topics), requestedTopicId);
  if ('error' in resolved) throw new Error(resolved.error);
  const valid = activeRecords(records).filter((r) => {
    if (r.projectId !== projectId) return false;
    const start = Date.parse(r.startedAt),
      end = r.endedAt === undefined ? undefined : Date.parse(r.endedAt);
    return (
      Number.isFinite(start) &&
      (end === undefined || (Number.isFinite(end) && end >= start))
    );
  });
  const distinct = new Map<string, ReportSourceRecord>();
  for (const r of valid) {
    const key = JSON.stringify([r.uid, r.id]);
    const existing = distinct.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(r))
      throw new Error('Fontes duplicadas divergentes.');
    distinct.set(key, r);
  }
  const warnings = new Set<string>();
  if (resolved.warning) warnings.add(resolved.warning);
  const source = [...distinct.values()].filter((r) => {
    const membership = calendarTopics(r, 0, topics);
    for (const w of membership.warnings) warnings.add(w);
    return membership.topics.some((t) => t.topicId === resolved.topicId);
  });
  // Full source/context is estimated BEFORE subject membership filtering; no per-subject budget.
  const reports = [...new Set([...distinct.values()].map((r) => r.uid))].map(
    (uid) => {
      const report = buildPersonalReport(
        { timeZone: 'America/Sao_Paulo' },
        {
          records: [...distinct.values()].filter((r) => r.uid === uid),
          scannedCount: records.length,
          nextCursor: null,
        },
        asOf,
        context.filter((r) => r.uid === uid),
      );
      for (const w of report.warnings) warnings.add(w);
      return report.intervals.map((r) => ({ ...r, uid }));
    },
  );
  const users = new Map<
    string,
    {
      uid: string;
      label: string;
      occurrenceCount: number;
      firstRecordStartedAt: string | null;
      lastRecordStartedAt: string | null;
      assignedMinutes: number;
      closedMinutes: number;
      estimatedMinutes: number;
      fullRecordMinutes: number;
    }
  >();
  const starts = source.map((r) => Date.parse(r.startedAt));
  for (const r of source) {
    let user = users.get(r.uid);
    if (!user) {
      user = {
        uid: r.uid,
        label: labels[r.uid] || 'Participante sem nome',
        occurrenceCount: 0,
        firstRecordStartedAt: null,
        lastRecordStartedAt: null,
        assignedMinutes: 0,
        closedMinutes: 0,
        estimatedMinutes: 0,
        fullRecordMinutes: 0,
      };
      users.set(r.uid, user);
    }
    user.occurrenceCount++;
    const start = Date.parse(r.startedAt);
    if (
      user.firstRecordStartedAt === null ||
      start < Date.parse(user.firstRecordStartedAt)
    )
      user.firstRecordStartedAt = new Date(start).toISOString();
    if (
      user.lastRecordStartedAt === null ||
      start > Date.parse(user.lastRecordStartedAt)
    )
      user.lastRecordStartedAt = new Date(start).toISOString();
  }
  let totalMinutes = 0,
    closedMinutes = 0,
    estimatedMinutes = 0,
    fullRecordMinutes = 0,
    unassignedMinutes = 0;
  const intervals = reports.flat().flatMap((interval) => {
    const candidates = source.filter(
      (r) =>
        r.id === interval.id &&
        r.uid === interval.uid &&
        r.projectId === interval.projectId,
    ); // Engine does not emit UID; attach by positional canonical source below.
    return candidates.map((record) => {
      const membership = calendarTopics(record, interval.minutes, topics),
        assigned = membership.topics.find(
          (t) => t.topicId === resolved.topicId,
        )?.assignedMinutes;
      for (const w of membership.warnings) warnings.add(w);
      const totalAssigned = membership.topics.reduce(
        (sum, t) => sum + (t.assignedMinutes ?? 0),
        0,
      );
      unassignedMinutes += Math.max(0, interval.minutes - totalAssigned);
      fullRecordMinutes += interval.minutes;
      const user = users.get(record.uid)!;
      user.fullRecordMinutes += interval.minutes;
      if (assigned !== undefined) {
        totalMinutes += assigned;
        user.assignedMinutes += assigned;
        if (interval.estimated) {
          estimatedMinutes += assigned;
          user.estimatedMinutes += assigned;
        } else {
          closedMinutes += assigned;
          user.closedMinutes += assigned;
        }
      }
      return {
        ...interval,
        uid: record.uid,
        readOnly: record.uid !== viewerUid,
        ...(assigned === undefined ? {} : { assignedMinutes: assigned }),
      };
    });
  });
  return {
    topicId: resolved.topicId,
    topicLabel: resolved.label,
    occurrenceCount: source.length,
    firstRecordStartedAt: starts.length
      ? new Date(Math.min(...starts)).toISOString()
      : null,
    lastRecordStartedAt: starts.length
      ? new Date(Math.max(...starts)).toISOString()
      : null,
    totalMinutes,
    closedMinutes,
    estimatedMinutes,
    fullRecordMinutes,
    unassignedMinutes,
    participants: [...users.values()],
    intervals,
    warnings: [
      ...warnings,
      'Ocorrências usam início real inclusive registros sem minutos; horas do assunto são atribuídas separadamente da duração completa dos registros.',
    ],
  };
}
