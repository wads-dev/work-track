import { ReportContextError } from './global-estimates.js';
export function calendarWeekAt(time: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(time);
  const value = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const date = new Date(
    Date.UTC(value('year'), value('month') - 1, value('day')),
  );
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
/** Civil-date Mondays in requested zone, half-open intervals; bounded work, never truncated history. */
export function occupiedWeeks(
  intervals: { effectiveStartedAt: string; effectiveEndedAt: string }[],
  timeZone: string,
) {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const civil = (time: number) => {
    const parts = format.formatToParts(time);
    const value = (type: string) => parts.find((p) => p.type === type)!.value;
    return Date.UTC(
      Number(value('year')),
      Number(value('month')) - 1,
      Number(value('day')),
    );
  };
  const weeks = new Set<string>();
  let work = 0;
  for (const interval of intervals) {
    const start = Date.parse(interval.effectiveStartedAt),
      end = Date.parse(interval.effectiveEndedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      continue;
    const last = civil(end - 1);
    for (let day = civil(start); day <= last; day += 86400000) {
      if (++work > 200000)
        throw new ReportContextError(
          'Histórico de semanas excede limite operacional de200000dias; nenhuma lista parcial retornada.',
        );
      const date = new Date(day),
        monday = day - ((date.getUTCDay() + 6) % 7) * 86400000;
      weeks.add(new Date(monday).toISOString().slice(0, 10));
      if (weeks.size > 10000)
        throw new ReportContextError(
          'Histórico excede10000semanas; nenhuma lista parcial retornada.',
        );
    }
  }
  return [...weeks].sort();
}
