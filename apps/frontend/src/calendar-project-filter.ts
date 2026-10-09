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
