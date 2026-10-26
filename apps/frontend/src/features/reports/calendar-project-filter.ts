/** Canonical selection identity, independent of URL ordering and duplicates. */
export const canonicalCalendarIds = (ids: readonly string[]) => {
  const unique = new Set(ids);
  unique.delete(''); // Empty URL value encodes no selection, not a dataset predicate.
  return [...unique].sort();
};
export function calendarProjects(params: URLSearchParams) {
  return canonicalCalendarIds(
    params.has('projectIds')
      ? params.getAll('projectIds')
      : [params.get('projectId') || ''],
  );
}
export function updateCalendarProjects(
  params: URLSearchParams,
  ids: readonly string[],
) {
  const next = new URLSearchParams(params);
  const selected = canonicalCalendarIds(ids);
  next.delete('projectId');
  next.delete('projectIds');
  for (const id of selected) next.append('projectIds', id);
  next.delete('subject');
  if (selected.length !== 1) next.delete('allWeeks');
  for (const key of ['record', 'recordTab', 'cursor', 'historyPage'])
    next.delete(key);
  return next;
}

export type CalendarProjectOption = { id: string; label: string };

// Labels arrive already masked by safeProject; never search raw project metadata.
export function calendarProjectOptions(
  projects: CalendarProjectOption[],
  selectedId: string,
): CalendarProjectOption[] {
  const options = [{ id: '', label: 'Todos os projetos' }, ...projects];
  if (selectedId && !projects.some((project) => project.id === selectedId))
    options.push({ id: selectedId, label: 'Projeto reservado' });
  return options;
}

export function updatePersonalFilters(
  params: URLSearchParams,
  key: string,
  value: string,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (key === 'clear') {
    next.delete('fromDate');
    next.delete('toDate');
    next.delete('projectId');
  } else if (value) next.set(key, value);
  else next.delete(key);
  if (key === 'view')
    next.set('density', value === 'month' ? 'supercompact' : 'timeline');
  next.delete('cursor');
  return next;
}
