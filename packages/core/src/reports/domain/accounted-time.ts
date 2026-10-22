import { activeRecords } from '../../registration/domain/record-lifecycle.js';
import {
  globalEstimates,
  recordKey,
  ReportContextError,
} from './global-estimates.js';
import type { ReportSourceRecord } from './project-report.js';

/** Half-open intervals. Equal shares are calculated per person, never across authors. */
export type AccountingSegment = {
  startedAt: number;
  endedAt: number;
  concurrent: number;
};
export function accountedMinutes(
  segments: readonly AccountingSegment[],
  from = -Infinity,
  to = Infinity,
): number {
  return segments.reduce(
    (total, s) =>
      total +
      Math.max(0, Math.min(to, s.endedAt) - Math.max(from, s.startedAt)) /
        s.concurrent /
        60000,
    0,
  );
}
/** Full authorized context enters here BEFORE display/project/topic/page filters.
 * Endpoints and logged durations are facts/estimates, never rewritten by allocation.
 * Sweep events once per author; queries integrate the resulting piecewise shares.
 */
export function buildTimeAccounting(
  context: ReportSourceRecord[],
  asOf: number,
) {
  const records = activeRecords(context);
  const estimates = globalEstimates(records, asOf);
  const authors = new Map<string, Map<number, number>>();
  const keys = new Set<string>();
  for (const r of records) {
    const key = recordKey(r);
    if (keys.has(key))
      throw new ReportContextError(
        'Contexto contém identidade de registro duplicada.',
      );
    keys.add(key);
    const start = Date.parse(r.startedAt),
      end = estimates.ends.get(key)!;
    if (end <= start) continue;
    let events = authors.get(r.uid);
    if (!events) authors.set(r.uid, (events = new Map<number, number>()));
    events.set(start, (events.get(start) ?? 0) + 1);
    events.set(end, (events.get(end) ?? 0) - 1);
  }
  const timelines = new Map<string, AccountingSegment[]>();
  for (const [uid, events] of authors) {
    const timeline: AccountingSegment[] = [];
    let previous = 0,
      concurrent = 0;
    for (const [instant, change] of [...events].sort(([a], [b]) => a - b)) {
      if (concurrent > 0 && instant > previous) {
        const last = timeline.at(-1);
        if (last?.endedAt === previous && last.concurrent === concurrent)
          last.endedAt = instant;
        else
          timeline.push({ startedAt: previous, endedAt: instant, concurrent });
      }
      concurrent += change;
      previous = instant;
    }
    timelines.set(uid, timeline);
  }
  return {
    ...estimates,
    segments(record: ReportSourceRecord, from = -Infinity, to = Infinity) {
      const start = Math.max(from, Date.parse(record.startedAt));
      const end = Math.min(to, estimates.ends.get(recordKey(record)) ?? start);
      return (timelines.get(record.uid) ?? []).flatMap((s) => {
        const startedAt = Math.max(start, s.startedAt),
          endedAt = Math.min(end, s.endedAt);
        return endedAt > startedAt ? [{ ...s, startedAt, endedAt }] : [];
      });
    },
  };
}
