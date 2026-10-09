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
export function calendarQueryBounds(range: CalendarQueryRange) {
  const from = Date.parse(range.from),
    to = Date.parse(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
    throw new Error('Intervalo de calendário inválido.');
  const pad = 2 * 86400000;
  return {
    lower: new Date(from - pad).toISOString().slice(0, 10),
    upper: new Date(to + pad).toISOString().slice(0, 10),
  };
}
/** Separate listeners are mandatory: OR adds implicit endedAt ordering and drops opens. */
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
  ];
}
