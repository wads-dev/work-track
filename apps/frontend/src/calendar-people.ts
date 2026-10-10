import { validateOccupiedWeeks } from './calendar-history';
export function calendarPerson(params: URLSearchParams, uid: string) {
  const selected = params.get('uid') || uid;
  return {
    selected,
    mode: selected === uid ? ('own' as const) : ('global' as const),
    ...(selected !== 'all' ? { userIds: [selected] } : {}),
  };
}
export function calendarRequest(
  params: URLSearchParams,
  uid: string,
  from: string,
  to: string,
  timeZone: string,
  includeArchived: boolean,
) {
  const person = calendarPerson(params, uid);
  const projectId = params.get('projectId');
  if (
    (params.get('subject') || params.get('allWeeks') === 'true') &&
    !projectId
  )
    throw new Error('Selecione um projeto.');
  return {
    ...(params.get('allWeeks') === 'true' ? { allWeeks: true } : { from, to }),
    timeZone,
    includeArchived,
    mode: person.mode,
    ...(projectId ? { projectId } : {}),
    ...(params.get('subject') ? { topicId: params.get('subject')! } : {}),
    ...(person.userIds ? { userIds: person.userIds } : {}),
  };
}
export function updateCalendarPerson(
  params: URLSearchParams,
  selected: string,
) {
  const next = new URLSearchParams(params);
  next.set('uid', selected);
  for (const key of ['record', 'recordTab', 'cursor', 'historyPage'])
    next.delete(key);
  return next;
}
export type CalendarResponse = {
  policy: string;
  mode: 'own' | 'global';
  viewerUid: string;
  scope: 'all-selected';
  asOf: string;
  from?: string;
  to?: string;
  allWeeks?: boolean;
  occupiedWeeks?: string[];
  weekOccurrences?: { week: string; occurrenceCount: number }[];
  timeZone: string;
  totalMinutes: number;
  estimatedCount: number;
  participantsUnavailable?: boolean;
  participants: { uid: string; label: string }[];
  byUser: { uid: string; label: string; minutes: number }[];
  intervals: {
    id: string;
    uid: string;
    projectId: string;
    startedAt: string;
    endedAt?: string;
    effectiveStartedAt: string;
    effectiveEndedAt: string;
    estimated: boolean;
    minutes: number;
    readOnly: boolean;
  }[];
  warnings: string[];
  page: {
    limit: number;
    scannedCount: number;
    excludedCount: number;
    nextCursor: null;
    partial: false;
  };
};
export function calendarReport(
  data: CalendarResponse,
  uid: string,
  mode: 'own' | 'global',
  allWeeks = false,
) {
  if (
    data.policy !== 'calendar-v3' ||
    data.viewerUid !== uid ||
    data.mode !== mode ||
    data.scope !== 'all-selected' ||
    data.page.partial ||
    data.page.nextCursor !== null
  )
    throw new Error('Calendário incompleto ou incompatível.');
  if (
    !Array.isArray(data.intervals) ||
    !Array.isArray(data.participants) ||
    !Array.isArray(data.warnings) ||
    !Number.isFinite(data.totalMinutes) ||
    data.totalMinutes < 0 ||
    !Number.isFinite(data.estimatedCount) ||
    data.estimatedCount < 0 ||
    new Set(data.participants.map((p) => p.uid)).size !==
      data.participants.length ||
    data.participants.some((p) => !p.uid || typeof p.label !== 'string')
  )
    throw new Error('Resposta de calendário inválida.');
  if (Boolean(data.allWeeks) !== allWeeks)
    throw new Error('Período de calendário incompatível.');
  if (data.allWeeks) {
    validateOccupiedWeeks(data.occupiedWeeks);
    if (data.from || data.to) throw new Error('Período histórico inválido.');
  }
  const keys = new Set<string>();
  const totals = new Map<string, number>();
  for (const item of data.intervals) {
    const key = JSON.stringify([item.uid, item.id]);
    if (
      keys.has(key) ||
      !item.id ||
      !item.projectId ||
      !Number.isFinite(item.minutes) ||
      item.minutes < 0 ||
      !Number.isFinite(Date.parse(item.startedAt)) ||
      !Number.isFinite(Date.parse(item.effectiveStartedAt)) ||
      !Number.isFinite(Date.parse(item.effectiveEndedAt)) ||
      Date.parse(item.effectiveEndedAt) < Date.parse(item.effectiveStartedAt) ||
      (item.effectiveEndedAt === item.effectiveStartedAt &&
        (!item.estimated ||
          item.endedAt !== undefined ||
          item.minutes !== 0 ||
          Date.parse(item.startedAt) !==
            Date.parse(item.effectiveStartedAt))) ||
      (item.endedAt && !Number.isFinite(Date.parse(item.endedAt)))
    )
      throw new Error('Intervalo de calendário inválido.');
    keys.add(key);
    if (!item.uid || (mode === 'own' && item.uid !== uid))
      throw new Error('Pessoa incompatível com o calendário solicitado.');
    totals.set(
      item.projectId,
      (totals.get(item.projectId) || 0) + item.minutes,
    );
  }
  return {
    ...data,
    budgetTimeZone: data.timeZone,
    from: data.from ?? '',
    to: data.to ?? '',
    byProject: Array.from(totals, ([projectId, minutes]) => ({
      projectId,
      minutes,
    })),
    byTopic: [],
    unassignedMinutes: 0,
  };
}
