import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  where,
  type Firestore,
  type Query,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { z } from 'zod';
import { isDeletedRecord } from '../../backend/src/modules/registration/domain/record-lifecycle';
import {
  calendarQueryBounds,
  type CalendarQueryRange,
} from './calendar-firestore-query';
import { AuthorizedReportRepository } from './authorized-report-repository';
import type { ClientReportProject } from './personal-report-repository';
import type { ReportSourceRecord } from '../../backend/src/modules/reports/domain/project-report';
export interface AuthorizedReportSnapshot {
  repository: AuthorizedReportRepository;
  coherent: boolean;
  fromCache: boolean;
  hasPendingWrites: boolean;
}
export function authorizedRecordQueries(
  db: Firestore,
  projectId: string,
  range?: CalendarQueryRange,
) {
  const base = collectionGroup(db, 'records');
  if (!range) return [query(base, where('projectId', '==', projectId))];
  const { lower, upper } = calendarQueryBounds(range);
  return [
    query(
      base,
      where('projectId', '==', projectId),
      where('startedAt', '>=', lower),
      where('startedAt', '<', upper),
    ),
    query(
      base,
      where('projectId', '==', projectId),
      where('endedAt', '>=', lower),
      where('startedAt', '<', upper),
    ),
  ];
}
const schema = z.object({
  uid: z.string(),
  projectId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  timeZone: z.string(),
  topics: z
    .array(
      z.object({
        topicId: z.string(),
        percentage: z.number().optional(),
        durationMinutes: z.number().optional(),
      }),
    )
    .default([]),
});
/** No cross-project collection-group scan: each record query carries an authorized parent ID.
 * Full work context deliberately remains separate from bounded visible selection: company-v3
 * allocates the same person's 480-minute budget across ALL work projects.
 */
export function subscribeAuthorizedReport(
  db: Firestore,
  uid: string,
  next: (s: AuthorizedReportSnapshot) => void,
  fail: (e: Error) => void,
  requiredProjectIds: readonly string[] = [],
  range?: CalendarQueryRange,
): Unsubscribe {
  const parentIds = [...new Set(requiredProjectIds)];
  let disposed = false;
  const catalog = new Map<number, Map<string, ClientReportProject>>(),
    projects = new Map<string, ClientReportProject>(),
    stops: Unsubscribe[] = [],
    groups = new Map<
      string,
      {
        token: object;
        stops: Unsubscribe[];
        batches: Map<number, QuerySnapshot<DocumentData>>;
        queries: Query<DocumentData>[];
      }
    >(),
    metadata = new Map<string, { cache: boolean; pending: boolean }>();
  let last: AuthorizedReportRepository | undefined;
  const stop = () => {
    disposed = true;
    stops.forEach((s) => s());
    groups.forEach((g) => g.stops.forEach((s) => s()));
    groups.clear();
    projects.clear();
    catalog.clear();
    metadata.clear();
    last = undefined;
  };
  const error = (e: Error) => {
    if (!disposed) {
      fail(e);
      stop();
    }
  };
  const emit = () => {
    if (disposed || catalog.size < 2 + parentIds.length) return;
    let coherent = true;
    const records: ReportSourceRecord[] = [],
      selected = new Set<string>();
    for (const [id, g] of groups) {
      if (g.batches.size !== g.queries.length) {
        coherent = false;
        continue;
      }
      const context = g.batches.get(0)!;
      const facts = new Map(context.docs.map((d) => [d.ref.path, d]));
      for (const d of context.docs) {
        const raw = d.data(),
          parts = d.ref.path.split('/');
        if (
          parts.length !== 4 ||
          parts[0] !== 'users' ||
          parts[2] !== 'records' ||
          raw.uid !== parts[1] ||
          raw.projectId !== id
        ) {
          error(new Error('Registro canônico inválido.'));
          return;
        }
        if (isDeletedRecord(raw)) continue;
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          error(new Error('Registro de relatório inválido.'));
          return;
        }
        records.push({
          ...raw,
          ...parsed.data,
          id: d.id,
        } as ReportSourceRecord);
      }
      if (g.queries.length > 1) {
        const { lower, upper } = calendarQueryBounds(range!);
        for (let i = 1; i < g.queries.length; i++) {
          const batch = g.batches.get(i)!,
            keys = new Set(batch.docs.map((d) => d.ref.path));
          for (const d of context.docs) {
            const data = d.data(),
              matches =
                typeof data.startedAt === 'string' &&
                data.startedAt < upper &&
                (i === 1
                  ? data.startedAt >= lower
                  : typeof data.endedAt === 'string' && data.endedAt >= lower);
            if (matches !== keys.has(d.ref.path)) coherent = false;
          }
          for (const d of batch.docs) {
            const c = facts.get(d.ref.path);
            if (!c || JSON.stringify(c.data()) !== JSON.stringify(d.data()))
              coherent = false;
            selected.add(d.ref.path);
          }
        }
      } else if (!range || !range.projectId || range.projectId === id)
        context.docs.forEach((d) => selected.add(d.ref.path));
    }
    if (coherent)
      last = new AuthorizedReportRepository(
        uid,
        records,
        new Map(projects),
        range ? selected : undefined,
      );
    if (!last) return;
    next({
      repository: last,
      coherent,
      fromCache: [...metadata.values()].some((m) => m.cache),
      hasPendingWrites: [...metadata.values()].some((m) => m.pending),
    });
  };
  const reconcile = () => {
    if (disposed) return;
    const current = new Map<string, ClientReportProject>();
    for (const [index, rows] of [...catalog].sort(([a], [b]) => a - b)) {
      // Explicit parent reads override typed list snapshots, including deletions
      // and access changes observed before those lists converge.
      if (index >= 2) current.delete(parentIds[index - 2]);
      for (const [id, p] of rows)
        if (
          p.type === undefined ||
          p.type === 'work' ||
          (p.type === 'personal' && p.createdBy === uid)
        )
          current.set(id, p);
    }
    projects.clear();
    current.forEach((p, id) => projects.set(id, p)); // Immediately fence revoked projects, even before replacement record listeners converge.
    if (last)
      last = new AuthorizedReportRepository(
        uid,
        last.records,
        new Map(projects),
        last.selectedKeys,
      );
    for (const [id, g] of groups)
      if (!current.has(id)) {
        g.stops.forEach((s) => s());
        groups.delete(id);
        for (let i = 0; i < g.queries.length; i++)
          metadata.delete(id + ':' + i);
      }
    for (const id of current.keys())
      if (!groups.has(id)) {
        const queries = [
          ...authorizedRecordQueries(db, id),
          ...(range && (!range.projectId || range.projectId === id)
            ? authorizedRecordQueries(db, id, range)
            : []),
        ];
        const g = {
          token: {},
          stops: [] as Unsubscribe[],
          batches: new Map<number, QuerySnapshot<DocumentData>>(),
          queries,
        };
        groups.set(id, g);
        queries.forEach((q, i) =>
          g.stops.push(
            onSnapshot(
              q,
              { includeMetadataChanges: true },
              (batch) => {
                if (disposed || groups.get(id) !== g) return;
                g.batches.set(i, batch);
                metadata.set(id + ':' + i, {
                  cache: batch.metadata.fromCache,
                  pending: batch.metadata.hasPendingWrites,
                });
                emit();
              },
              (e) => {
                if (disposed || groups.get(id) !== g) return;
                error(e);
              },
            ),
          ),
        );
      }
    emit();
  };
  const project = (data: DocumentData): ClientReportProject => ({
    ...data,
    topics: Array.isArray(data.topics) ? data.topics : [],
  });
  [
    query(collection(db, 'projects'), where('type', '==', 'work')),
    query(
      collection(db, 'projects'),
      where('type', '==', 'personal'),
      where('createdBy', '==', uid),
    ),
  ].forEach((q, i) =>
    stops.push(
      onSnapshot(
        q,
        { includeMetadataChanges: true },
        (s) => {
          if (disposed) return;
          catalog.set(i, new Map(s.docs.map((d) => [d.id, project(d.data())])));
          metadata.set('catalog:' + i, {
            cache: s.metadata.fromCache,
            pending: s.metadata.hasPendingWrites,
          });
          reconcile();
        },
        error,
      ),
    ),
  );
  parentIds.forEach((id, i) =>
    stops.push(
      onSnapshot(
        doc(db, 'projects', id),
        { includeMetadataChanges: true },
        (s) => {
          if (disposed) return;
          catalog.set(
            2 + i,
            new Map(s.exists() ? [[id, project(s.data())]] : []),
          );
          metadata.set('catalog:' + (2 + i), {
            cache: s.metadata.fromCache,
            pending: s.metadata.hasPendingWrites,
          });
          reconcile();
        },
        error,
      ),
    ),
  );
  return stop;
}
