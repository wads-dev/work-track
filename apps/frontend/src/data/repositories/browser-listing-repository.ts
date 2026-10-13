import {
  collection,
  doc,
  documentId,
  getDocFromCache,
  getDocsFromCache,
  query,
  where,
  type Firestore,
  type Query,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { object, objects, text, type Row } from '../../shared/data';
import { isDeletedRecord } from '../cache/record-deletion';
import { isoDateCandidatePrefix } from '../sources/calendar-firestore-query';
import { traceFirestore } from '../sync/firestore-diagnostics';
import { customRange, validZone } from '../../features/reports/calendar-utils';
import { safeProject, safeRecord, isHidden } from '../../shared/ui/privacy';
import type { ProjectOption } from '../../features/projects/project-search';

export type ProjectReadOptions = {
  scope?: 'all' | 'personal' | 'work';
  id?: string;
  archive?: string;
  query?: string;
  revealed?: boolean;
  page?: number;
  size?: number;
};
export type OwnRecordReadOptions = Partial<RecordFilters> & {
  id?: string;
  openOnly?: boolean;
  alertBefore?: number;
  alertOnly?: boolean;
  now?: number;
  size?: number;
  page?: number;
  after?: string;
  revealed?: boolean;
  includeDeleted?: boolean;
};
export type ListingResult = {
  rows: Row[];
  total: number;
  page: number;
  hasMore: boolean;
  cursor: string;
  openRows: Row[];
  openCount: number;
};
export const emptyListing: ListingResult = {
  rows: [],
  total: 0,
  page: 0,
  hasMore: false,
  cursor: '',
  openRows: [],
  openCount: 0,
};
export const listingKey = (
  options: ProjectReadOptions | OwnRecordReadOptions = {},
) => JSON.stringify(options);

async function readQuery(target: Query<DocumentData>, label: string) {
  traceFirestore('cache.read', {
    collection: label,
    source: 'browser-listing',
  });
  try {
    const result = await getDocsFromCache(target);
    traceFirestore('cache.result', {
      collection: label,
      source: 'browser-listing',
      count: result.docs.length,
    });
    return result.docs.map((item) => ({ id: item.id, data: item.data() }));
  } catch (error) {
    traceFirestore('cache.result', {
      collection: label,
      source: 'browser-listing',
      count: 0,
      failed: true,
    });
    throw error;
  }
}
/** Re-read the parent by ID: persistent cache may retain revoked projects. The
 * current session allowlist AND current local project metadata must agree. */
export async function readAuthorizedProjectById(
  db: Firestore,
  uid: string,
  id: string,
  authorizedIds: ReadonlySet<string>,
): Promise<Row | undefined> {
  if (!uid || !id || !authorizedIds.has(id)) return undefined;
  traceFirestore('cache.read', {
    collection: 'projects',
    source: 'browser-listing-acl',
    id,
  });
  try {
    const result = await getDocFromCache(doc(db, 'projects', id));
    traceFirestore('cache.result', {
      collection: 'projects',
      source: 'browser-listing-acl',
      count: result.exists() ? 1 : 0,
    });
    if (!result.exists()) return undefined;
    const data = result.data();
    return canAccessProject(data, uid) ? { id, data } : undefined;
  } catch (error) {
    traceFirestore('cache.result', {
      collection: 'projects',
      source: 'browser-listing-acl',
      count: 0,
      failed: true,
    });
    // Uncached/deleted parents have no local authorized value. Never fetch remotely.
    if (object(error).code === 'unavailable') return undefined;
    throw error;
  }
}
function listing(
  rows: Row[],
  options: { size?: number; page?: number; after?: string },
): ListingResult {
  const total = rows.length;
  const size = options.size && options.size > 0 ? options.size : undefined;
  const page = size
    ? Math.min(
        Math.max(0, options.page ?? 0),
        Math.max(0, Math.ceil(total / size) - 1),
      )
    : 0;
  const visible = size ? rows.slice(page * size, (page + 1) * size) : rows;
  const open = rows.filter(
    (row) =>
      !isDeletedRecord(row.data) &&
      (row.data.endedAt === null || row.data.endedAt === undefined),
  );
  return {
    rows: visible,
    total,
    page,
    hasMore: Boolean(size && (page + 1) * size < total),
    cursor: visible.at(-1)?.id ?? options.after ?? '',
    openRows: open.slice(0, 5),
    openCount: open.length,
  };
}
export async function readProjectListing(
  db: Firestore,
  uid: string,
  authorizedIds: ReadonlySet<string>,
  options: ProjectReadOptions = {},
): Promise<ListingResult> {
  if (!uid) return emptyListing;
  if (options.id) {
    const row = await readAuthorizedProjectById(
      db,
      uid,
      options.id,
      authorizedIds,
    );
    return listing(row ? [row] : [], options);
  }
  const ids = [...authorizedIds];
  const rows: Row[] = [];
  for (let start = 0; start < ids.length; start += 30) {
    const clauses: QueryConstraint[] = [
      where(documentId(), 'in', ids.slice(start, start + 30)),
    ];
    if (options.scope === 'personal' || options.scope === 'work')
      clauses.push(where('type', '==', options.scope));
    // Archived-only has no missing-field inclusion: query the union of archived
    // flags and merge targets, including the empty-string existing merge marker.
    // Separate AND branches also stay within Firestore's 30-disjunction ID cap.
    const branches =
      options.archive === 'archived'
        ? [where('archived', '==', true), where('mergedInto', '>=', '')]
        : [undefined];
    for (const branch of branches)
      rows.push(
        ...(await readQuery(
          query(
            collection(db, 'projects'),
            ...clauses,
            ...(branch ? [branch] : []),
          ),
          'projects',
        )),
      );
  }
  const candidates = [...new Map(rows.map((row) => [row.id, row])).values()];
  // Firebase has no predicate for missing fields. Active includes missing
  // archived/mergedInto. Substring/full-text and
  // properties inside embedded topic arrays are also unsupported. The archived
  // union is native; its range can include higher Firestore types, so validate
  // the string merge marker and ACL after deduplicating the two query branches.
  const selected = candidates.filter((row) => {
    if (!authorizedIds.has(row.id) || !canAccessProject(row.data, uid))
      return false;
    const archived =
      row.data.archived === true || typeof row.data.mergedInto === 'string';
    if (
      (options.archive === 'active' && archived) ||
      (options.archive === 'archived' && !archived)
    )
      return false;
    const display = safeProject(row.data, options.revealed ?? false);
    return normalized(
      [
        row.id,
        display.title,
        display.description,
        ...objects(display.topics).map((t) => t.title),
      ].join(' '),
    ).includes(normalized(options.query?.trim() ?? ''));
  });
  return listing(selected, options);
}
/** Safe upper date-prefix envelope for ISO offset strings. String order cannot
 * compare offset instants, so the exact overlap test remains below. Two full days
 * covers writer-accepted ISO offsets up to +/-23:59, never a closed-record lower
 * start bound (records can span the entire selected period). */
function datePrefixEnvelope(instant: string, direction: -1 | 1) {
  return (
    isoDateCandidatePrefix(Date.parse(instant), direction) +
    (direction === 1 ? '\uf8ff' : '')
  );
}
export async function readOwnRecordListing(
  db: Firestore,
  uid: string,
  authorizedIds: ReadonlySet<string>,
  options: OwnRecordReadOptions = {},
): Promise<ListingResult> {
  if (!uid || !authorizedIds.size) return emptyListing;
  const filters: RecordFilters = {
    project: options.project ?? '',
    topic: options.topic ?? '',
    query: options.query ?? '',
    fromDate: options.fromDate ?? '',
    toDate: options.toDate ?? '',
    zone: options.zone ?? 'America/Sao_Paulo',
    status: options.openOnly ? 'open' : (options.status ?? 'all'),
  };
  const range = recordRange(filters);
  const alertBefore = options.alertOnly
    ? (options.now ?? Date.now()) - 8 * 3600000
    : options.alertBefore;
  const clauses: QueryConstraint[] = [where('uid', '==', uid)];
  if (options.id) clauses.push(where(documentId(), '==', options.id));
  if (filters.project) clauses.push(where('projectId', '==', filters.project));
  if (options.after) clauses.push(where(documentId(), '>', options.after));
  if (filters.status === 'closed') clauses.push(where('endedAt', '>', ''));
  if (range) {
    clauses.push(where('startedAt', '<=', datePrefixEnvelope(range.to, 1)));
    if (filters.status === 'closed')
      clauses.push(where('endedAt', '>=', datePrefixEnvelope(range.from, -1)));
    // No lower start bound: an old still-open record can cross the entire period.
  }
  if (alertBefore !== undefined)
    clauses.push(
      where(
        'startedAt',
        '<=',
        datePrefixEnvelope(new Date(alertBefore).toISOString(), 1),
      ),
    );
  const raw: Row[] = [];
  if (filters.project) {
    if (!authorizedIds.has(filters.project)) return emptyListing;
    raw.push(
      ...(await readQuery(
        query(collection(db, 'users', uid, 'records'), ...clauses),
        'records',
      )),
    );
  } else {
    const ids = [...authorizedIds];
    for (let start = 0; start < ids.length; start += 30) {
      raw.push(
        ...(await readQuery(
          query(
            collection(db, 'users', uid, 'records'),
            ...clauses,
            where('projectId', 'in', ids.slice(start, start + 30)),
          ),
          'records',
        )),
      );
    }
  }
  const parents = new Map<string, Row | undefined>();
  for (const row of raw) {
    const id = text(row.data.projectId, '');
    if (!parents.has(id))
      parents.set(
        id,
        await readAuthorizedProjectById(db, uid, id, authorizedIds),
      );
  }
  const authorized = raw.filter(
    (row) =>
      row.data.uid === uid &&
      parents.has(text(row.data.projectId, '')) &&
      Boolean(parents.get(text(row.data.projectId, ''))),
  );
  // Missing endedAt/deletedAt, substring text, topic arrays/alias graphs and
  // comparisons of ISO strings with offsets are not expressible in Firestore.
  const selected = authorized.filter((row) => {
    if (
      (options.includeDeleted === false ||
        options.openOnly ||
        options.alertOnly) &&
      isDeletedRecord(row.data)
    )
      return false;
    const parent = parents.get(text(row.data.projectId, ''))!;
    const visible = safeRecord(
      row.data,
      isHidden(parent.data, options.revealed ?? false),
    );
    if (
      !matchesRecordResidual(
        row.id,
        visible,
        { ...filters, project: '', query: '' },
        objects(parent.data.topics),
        range,
      )
    )
      return false;
    if (
      !matchesRecordResidual(
        row.id,
        visible,
        {
          ...filters,
          project: '',
          topic: '',
          status: 'all',
          fromDate: '',
          toDate: '',
        },
        [],
        null,
      )
    )
      return false;
    if (
      alertBefore !== undefined &&
      !(Date.parse(text(row.data.startedAt, '')) < alertBefore)
    )
      return false;
    return true;
  });
  // Instant sorting is necessary: lexical order of persisted ISO-offset strings
  // differs from chronological order. Pagination follows the full residual so
  // counts never silently describe a database-limited candidate sample.
  const ordered =
    options.after || (options.size && options.page === undefined)
      ? selected.sort((a, b) => a.id.localeCompare(b.id))
      : sortRecords(selected);
  return listing(ordered, options);
}
/** Compatibility adapters for old pure-domain tests; screen callers must use
 * readOwnRecordListing so supported predicates execute against native cache. */
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
/** Pure compatibility selector; new screen consumers use the native query API. */
export function filterRecords(
  rows: Row[],
  filters: RecordFilters,
  catalog: Record<string, unknown>[] = [],
) {
  const range = recordRange(filters);
  return sortRecords(
    rows.filter(
      (row) =>
        !isDeletedRecord(row.data) &&
        matchesRecordResidual(row.id, row.data, filters, catalog, range),
    ),
  );
}
/** Firebase cannot query missing end fields, normalized substrings, embedded
 * array properties/alias graphs or timestamp instants stored as ISO offsets. */
function matchesRecordResidual(
  id: string,
  data: Record<string, unknown>,
  filters: RecordFilters,
  catalog: Record<string, unknown>[],
  range: ReturnType<typeof recordRange>,
) {
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
      !(open ? start < to : start < to && end > from)
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
/** Firebase has no full-text query; nested option arrays are caller-supplied
 * presentation projections, not a second remote dataset. In masked mode ignore
 * searchText entirely: older callers may have included hidden raw metadata. */
export function createProjectOptionRepository(
  options: readonly ProjectOption[],
  revealed: boolean,
) {
  const byId = new Map(options.map((option) => [option.id, option]));
  const select = (search: string) =>
    options.filter((option) =>
      normalized(
        revealed ? (option.searchText ?? option.label) : option.label,
      ).includes(normalized(search)),
    );
  return {
    read: (id: string) => byId.get(id),
    select,
    search: async (search: string) => select(search),
  };
}
