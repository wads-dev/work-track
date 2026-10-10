import { object, objects, type Row } from '../../shared/data';
import { isDeletedRecord } from '../../data/cache/record-deletion';
import { customRange, validZone } from '../reports/calendar-utils';
export type RecordFilters = {
  project: string;
  topic: string;
  query: string;
  fromDate: string;
  toDate: string;
  zone: string;
  status: string;
};
export function recordRange(filters: RecordFilters) {
  validZone(filters.zone);
  if (!filters.fromDate && !filters.toDate) return null;
  if (!filters.fromDate || !filters.toDate)
    throw Error('Informe as duas datas do período.');
  return customRange(filters.fromDate, filters.toDate, filters.zone);
}
const normalized = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function filterRecords(
  rows: Row[],
  filters: RecordFilters,
  catalog: Record<string, unknown>[] = [],
) {
  const range = recordRange(filters);
  return sortRecords(rows.filter((row) => !isDeletedRecord(row.data))).filter(
    ({ id, data }) => {
      if (filters.project && data.projectId !== filters.project) return false;
      if (
        filters.topic &&
        !objects(data.topics).some((topic) =>
          matchesRecordTopic(catalog, topic.topicId, filters.topic),
        ) &&
        !objects(data.topicSnapshots).some((topic) =>
          matchesRecordTopic(catalog, topic.id ?? topic.topicId, filters.topic),
        )
      )
        return false;
      const open = data.endedAt === null || data.endedAt === undefined;
      if (
        (filters.status === 'open' && !open) ||
        (filters.status === 'closed' && open)
      )
        return false;
      if (range) {
        const start =
          typeof data.startedAt === 'string' ? Date.parse(data.startedAt) : NaN;
        const end = open
          ? start
          : typeof data.endedAt === 'string'
            ? Date.parse(data.endedAt)
            : NaN;
        const from = Date.parse(range.from);
        const to = Date.parse(range.to);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          end < start ||
          !(open ? start >= from && start < to : start < to && end > from)
        )
          return false;
      }
      return normalized(
        [
          id,
          data.originalText,
          data.interpretation,
          object(data.projectSnapshot).title,
          ...objects(data.topicSnapshots).map((t) => t.title),
        ]
          .filter((v) => typeof v === 'string')
          .join(' '),
      ).includes(normalized(filters.query.trim()));
    },
  );
}
export function resolveRecordTopic(
  catalog: Record<string, unknown>[],
  id: unknown,
): unknown {
  const visited = new Set();
  let current = id;
  while (
    typeof current === 'string' &&
    !visited.has(current) &&
    visited.size < 200
  ) {
    visited.add(current);
    const matches = catalog.filter((t) => t.id === current);
    if (matches.length !== 1)
      return matches.length === 0 && current === id ? id : undefined;
    const topic = matches[0];
    if (topic.mergedIntoTopicId === undefined) return current;
    current = topic.mergedIntoTopicId;
  }
  return undefined;
}
function matchesRecordTopic(
  catalog: Record<string, unknown>[],
  id: unknown,
  selected: string,
) {
  const resolved = resolveRecordTopic(catalog, id);
  return (
    resolved !== undefined && resolved === resolveRecordTopic(catalog, selected)
  );
}
export function recordPage(rows: Row[], page: number, size = 50) {
  return rows.slice(page * size, (page + 1) * size);
}
export function sortRecords(rows: Row[]) {
  const instant = (row: Row) =>
    typeof row.data.startedAt === 'string'
      ? Date.parse(row.data.startedAt)
      : NaN;
  return [...rows].sort((a, b) => {
    const x = instant(a),
      y = instant(b);
    if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return y - x;
    if (Number.isFinite(x) !== Number.isFinite(y))
      return Number.isFinite(x) ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}
