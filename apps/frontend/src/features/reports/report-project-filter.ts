import {
  calendarProjects,
  canonicalCalendarIds,
  updatePersonalFilters,
} from './calendar-project-filter';

/** Reports use repeated projectIds, retaining old singular deep links on read. */
export const reportProjects = calendarProjects;
export function updateReportProjects(
  params: URLSearchParams,
  ids: readonly string[],
) {
  const next = new URLSearchParams(params);
  next.delete('projectId');
  next.delete('projectIds');
  for (const id of canonicalCalendarIds(ids)) next.append('projectIds', id);
  for (const key of ['cursor', 'record', 'recordTab']) next.delete(key);
  return next;
}
export function updateReportFilters(
  params: URLSearchParams,
  key: string,
  value: string,
) {
  const next = updatePersonalFilters(params, key, value);
  if (key === 'clear') next.delete('projectIds');
  next.delete('record');
  next.delete('recordTab');
  return next;
}
