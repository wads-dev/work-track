import {
  accountedMinutes,
  type AccountingSegment,
} from '@work-track/core/reports/domain/accounted-time';
export function durationLabel(minutes: number) {
  const rounded = Math.round(minutes * 10) / 10;
  const hours = Math.floor(rounded / 60),
    rest = Math.round((rounded - hours * 60) * 10) / 10;
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  return hours
    ? hours + 'h' + (rest ? ' ' + number.format(rest) + 'min' : '')
    : number.format(rest) + 'min';
}
type CalendarDurationItem = {
  minutes?: number;
  loggedMinutes?: number;
  allocatedMinutes?: number;
  timeMultiplier?: number;
  accountingSegments?: AccountingSegment[];
  effectiveStartedAt: string;
  effectiveEndedAt: string;
};
export function calendarDurationDetails(
  item: CalendarDurationItem,
  from = -Infinity,
  to = Infinity,
) {
  const start = Math.max(from, Date.parse(item.effectiveStartedAt)),
    end = Math.min(to, Date.parse(item.effectiveEndedAt));
  const logged = Math.max(0, (end - start) / 60000);
  if (!item.accountingSegments)
    return (
      'Logged: ' +
      durationLabel(logged) +
      '. Tempo computado requer contexto das outras atividades.'
    );
  const allocated = accountedMinutes(item.accountingSegments, start, end),
    factor = item.timeMultiplier ?? 1;
  return (
    'Logged: ' +
    durationLabel(logged) +
    ' · Após rateio: ' +
    durationLabel(allocated) +
    ' · Multiplicador no início do registro: ' +
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(
      factor,
    ) +
    '× · Computado: ' +
    durationLabel(allocated * factor)
  );
}
export function calendarDuration(
  item: {
    minutes?: number;
    loggedMinutes?: number;
    allocatedMinutes?: number;
    timeMultiplier?: number;
    accountingSegments?: AccountingSegment[];
    effectiveStartedAt: string;
    effectiveEndedAt: string;
  },
  from = -Infinity,
  to = Infinity,
) {
  const start = Math.max(from, Date.parse(item.effectiveStartedAt)),
    end = Math.min(to, Date.parse(item.effectiveEndedAt));
  const logged = Math.max(0, (end - start) / 60000);
  // Never infer an accounted duration from wall-clock endpoints without context.
  const minutes = item.accountingSegments
    ? accountedMinutes(item.accountingSegments, start, end) *
      (item.timeMultiplier ?? 1)
    : undefined;
  if (minutes === undefined)
    return item.minutes !== undefined && from === -Infinity && to === Infinity
      ? durationLabel(item.minutes)
      : 'Logged: ' + durationLabel(logged);
  return (
    durationLabel(minutes) +
    (Math.abs(minutes - logged) > 0.000001
      ? ' (logged: ' + durationLabel(logged) + ')'
      : '')
  );
}
