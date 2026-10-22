import { dayKey } from '../reports/calendar-utils';

/** Navigate using the calendar's local day, not the timestamp's UTC date. */
export function pendingCalendarPath(recordId: string, startedAt: unknown) {
  const params = new URLSearchParams({ view: 'day', record: recordId });
  if (typeof startedAt === 'string') {
    const instant = new Date(startedAt);
    if (Number.isFinite(instant.getTime()))
      params.set('date', dayKey(instant, 'America/Sao_Paulo'));
  }
  return '/calendar?' + params.toString();
}
