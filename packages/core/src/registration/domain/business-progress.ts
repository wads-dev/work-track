import {
  businessHoursSchema,
  monthBusinessHours,
  localCalendarDate,
  type BusinessHoursPeriod,
  type Holiday,
} from './business-hours.js';
import { accountedMinutes } from '../../reports/domain/accounted-time.js';
import { nextMidnight } from '../../reports/domain/report-time.js';
import type { ProjectReport } from '../../reports/domain/project-report.js';
export interface BusinessProgress {
  month: string;
  total: number;
  expected: number;
  delivered: number;
  people: { uid: string; label: string; hours: number }[];
}
/** Aggregates already-authorized accounting segments, not a persisted dataset selection.
 * Split intervals at real local midnights, preserving overlap allocations and multipliers. */
export function projectBusinessProgress(
  report: ProjectReport,
  periods: BusinessHoursPeriod[],
  holidays: Holiday[],
  now: Date,
): BusinessProgress[] {
  businessHoursSchema.parse(periods);
  const today = localCalendarDate(now);
  const currentMonth = today.slice(0, 7);
  const labels = new Map(
    report.byUser.map((person) => [person.uid, person.label]),
  );
  let first = currentMonth;
  for (const record of report.records)
    first = [
      first,
      localCalendarDate(new Date(record.startedAt)).slice(0, 7),
    ].sort()[0]!;
  const buckets = new Map<string, Map<string, number>>();
  for (const record of report.records) {
    const start = Date.parse(record.startedAt),
      end = Date.parse(record.effectiveEndedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end))
      throw new Error('Intervalo inválido no relatório.');
    let cursor = start;
    let count = 0;
    while (cursor < end) {
      if (++count > 36600)
        throw new Error('Intervalo excede o orçamento de cálculo.');
      const stop = Math.min(end, nextMidnight(cursor, 'America/Sao_Paulo'));
      const month = localCalendarDate(new Date(cursor)).slice(0, 7);
      const minutes = record.accountingSegments
        ? accountedMinutes(record.accountingSegments, cursor, stop) *
          (record.timeMultiplier ?? 1)
        : (record.minutes * (stop - cursor)) / (end - start);
      let people = buckets.get(month);
      if (!people) buckets.set(month, (people = new Map<string, number>()));
      people.set(record.uid, (people.get(record.uid) ?? 0) + minutes / 60);
      cursor = stop;
    }
  }
  const result: BusinessProgress[] = [];
  const cursor = new Date(first + '-01T12:00:00Z');
  while (cursor.toISOString().slice(0, 7) <= currentMonth) {
    if (result.length >= 1200)
      throw new Error(
        'Histórico excede 100 anos; nenhum total parcial retornado.',
      );
    const month = cursor.toISOString().slice(0, 7);
    const target = monthBusinessHours(month, periods, holidays, today);
    const people = [...(buckets.get(month) ?? new Map<string, number>())]
      .map(([uid, hours]) => ({ uid, hours, label: labels.get(uid) ?? uid }))
      .sort((a, b) => a.uid.localeCompare(b.uid));
    result.push({
      month,
      total: target.total,
      expected: target.expected,
      delivered: people.reduce((sum, p) => sum + p.hours, 0),
      people,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result.reverse();
}
