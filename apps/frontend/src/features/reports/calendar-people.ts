import type { CalendarInput } from '@work-track/core/reports/application/calendar-input';
import type { CalendarResponse } from '@work-track/core/contracts/report-responses';
export type { CalendarResponse } from '@work-track/core/contracts/report-responses';
import { validateOccupiedWeeks } from './calendar-history';
import {
  calendarProjects,
  canonicalCalendarIds,
} from './calendar-project-filter';
export function calendarPerson(params: URLSearchParams, uid: string) {
  const ids = params.has('userIds')
    ? canonicalCalendarIds(params.getAll('userIds'))
    : params.get('uid') === 'all'
      ? []
      : [params.get('uid') || uid];
  const selected = ids.length === 1 ? ids[0] : 'all';
  return {
    selected,
    ids,
    showPeople: ids.length !== 1,
    mode:
      ids.length === 1 && ids[0] === uid
        ? ('own' as const)
        : ('global' as const),
    ...(ids.length ? { userIds: ids } : {}),
  };
}
export function calendarRequest(
  params: URLSearchParams,
  uid: string,
  from: string,
  to: string,
  timeZone: string,
  includeArchived: boolean,
): Omit<CalendarInput, 'allWeeks'> & { allWeeks?: boolean } {
  const person = calendarPerson(params, uid);
  const projectIds = calendarProjects(params);
  if (projectIds.length > 100 || person.ids.length > 100)
    throw new Error('Selecione no máximo 100 projetos ou pessoas.');
  if (params.has('projectIds') && params.has('projectId'))
    throw new Error('Use projectIds ou projectId, não ambos.');
  if (params.has('userIds') && params.has('uid'))
    throw new Error('Use userIds ou uid, não ambos.');
  if (
    (params.get('subject') || params.get('allWeeks') === 'true') &&
    projectIds.length !== 1
  )
    throw new Error('Selecione exatamente um projeto.');
  return {
    ...(params.get('allWeeks') === 'true' ? { allWeeks: true } : { from, to }),
    timeZone,
    includeArchived,
    mode: person.mode,
    ...(projectIds.length
      ? params.has('projectIds')
        ? { projectIds }
        : { projectId: projectIds[0] }
      : {}),
    ...(params.get('subject') ? { topicId: params.get('subject')! } : {}),
    ...(person.userIds ? { userIds: person.userIds } : {}),
  };
}
export function updateCalendarPeople(
  params: URLSearchParams,
  ids: readonly string[],
) {
  const next = new URLSearchParams(params);
  next.delete('uid');
  next.delete('userIds');
  const selected = canonicalCalendarIds(ids);
  if (!selected.length) next.set('uid', 'all');
  else for (const id of selected) next.append('userIds', id);
  for (const key of ['record', 'recordTab', 'cursor', 'historyPage'])
    next.delete(key);
  return next;
}
export function updateCalendarPerson(
  params: URLSearchParams,
  selected: string,
) {
  const next = updateCalendarPeople(params, []);
  next.set('uid', selected);
  return next;
}
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
