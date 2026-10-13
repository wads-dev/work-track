import { collection, query, where, type Firestore } from 'firebase/firestore';

export interface CalendarQueryRange {
  from: string;
  to: string;
  projectId?: string;
}
/** Existing facts retain arbitrary ISO offsets. Date-prefix guards deliberately overfetch
 * at the boundaries; the shared use case still performs exact instant clipping.
 * Never compare arbitrary offset ISO strings to a UTC timestamp as chronological keys.
 * Context includes all projects: project filtering BEFORE budget would change personal-v3.
 */
/** Lexical sentinel beyond valid four-digit ISO writer dates; no wrap at year9999. */
export function isoDateCandidatePrefix(instant: number, direction: -1 | 1) {
  const value = instant + direction * 2 * 86400000;
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(value) || !Number.isFinite(year))
    throw new Error('Limite temporal inválido.');
  if (year > 9999) return '\uf8ff';
  if (year < 0) return '';
  return date.toISOString().slice(0, 10);
}
export function calendarQueryBounds(range: CalendarQueryRange) {
  const from = Date.parse(range.from),
    to = Date.parse(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
    throw new Error('Intervalo de calendário inválido.');
  return {
    lower: isoDateCandidatePrefix(from, -1),
    upper: isoDateCandidatePrefix(to, 1),
  };
}
/** Local candidate branches, not listeners. Missing legacy endedAt requires an
 * old-start branch and an open-only residual in the repository; OR/range support
 * does not provide an IS MISSING predicate. */
export function calendarRecordQueries(
  db: Firestore,
  uid: string,
  range: CalendarQueryRange,
  context = false,
) {
  if (!uid || uid.includes('/'))
    throw new Error('Usuário de calendário inválido.');
  const { lower, upper } = calendarQueryBounds(range);
  const base = collection(db, 'users', uid, 'records');
  const project =
    !context && range.projectId
      ? [where('projectId', '==', range.projectId)]
      : [];
  return [
    query(
      base,
      ...project,
      where('startedAt', '>=', lower),
      where('startedAt', '<', upper),
    ),
    query(
      base,
      ...project,
      where('endedAt', '>=', lower),
      where('startedAt', '<', upper),
    ),
    query(base, ...project, where('startedAt', '<', lower)),
  ];
}
