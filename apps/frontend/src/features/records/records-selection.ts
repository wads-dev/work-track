import { canonicalCalendarIds } from '../reports/calendar-project-filter';

/** Canonical URL state for own-record project selection. Empty means all. */
export function recordProjectIds(params: URLSearchParams): string[] {
  const values = params.has('projectIds')
    ? params.getAll('projectIds')
    : [params.get('project') ?? ''];
  return canonicalCalendarIds(values.map((id) => id.trim()));
}

export function writeRecordProjects(params: URLSearchParams, ids: string[]) {
  const next = new URLSearchParams(params);
  const previous = recordProjectIds(params);
  const selected = canonicalCalendarIds(ids.map((id) => id.trim()));
  next.delete('project');
  next.delete('projectIds');
  for (const id of selected) next.append('projectIds', id);
  if (
    selected.length !== 1 ||
    previous.length !== 1 ||
    previous[0] !== selected[0]
  )
    next.delete('topic');
  return next;
}
