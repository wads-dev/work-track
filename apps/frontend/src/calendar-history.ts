import { objects, text } from './data';
import { isHidden } from './privacy';
import { parseDay } from './calendar-utils';
export function calendarTopics(
  project: Record<string, unknown> | undefined,
  revealed: boolean,
  includeArchived: boolean,
) {
  if (!project || isHidden(project, revealed)) return [];
  return objects(project.topics)
    .filter((t) => !t.mergedIntoTopicId && (includeArchived || !t.archived))
    .map((t) => ({ id: text(t.id, ''), label: text(t.title, 'Assunto') }))
    .filter((t) => !!t.id);
}
export function updateCalendarFilters(
  params: URLSearchParams,
  key: string,
  value: string,
) {
  const next = new URLSearchParams(params);
  if (key === 'clear') {
    for (const name of [
      'projectId',
      'subject',
      'allWeeks',
      'date',
      'fromDate',
      'toDate',
    ])
      next.delete(name);
  } else if (value) next.set(key, value);
  else next.delete(key);
  if (key === 'projectId') {
    next.delete('subject');
    if (!value) next.delete('allWeeks');
  }
  if (key === 'allWeeks') {
    next.delete('date');
    next.delete('fromDate');
    next.delete('toDate');
    next.set('view', 'week');
    next.set('density', 'timeline');
  }
  if (key === 'date') next.delete('allWeeks');
  for (const name of ['record', 'recordTab', 'cursor', 'historyPage'])
    next.delete(name);
  return next;
}
export function validateOccupiedWeeks(weeks: unknown) {
  if (!Array.isArray(weeks) || weeks.length > 10000)
    throw new Error('Semanas históricas inválidas.');
  let previous = '';
  for (const week of weeks) {
    if (
      typeof week !== 'string' ||
      parseDay(week).getUTCDay() !== 1 ||
      (previous && week <= previous)
    )
      throw new Error('Semanas históricas inválidas.');
    previous = week;
  }
  return weeks as string[];
}
