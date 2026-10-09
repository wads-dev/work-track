import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type QuerySnapshot,
  type QueryDocumentSnapshot,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  calendarRecordQueries,
  type CalendarQueryRange,
} from './calendar-firestore-query';
import type { ReportSourceRecord } from '../../backend/src/modules/reports/domain/project-report';
import {
  ClientPersonalReportRepository,
  type ClientReportProject,
} from './personal-report-repository';
export interface PersonalReportSnapshot {
  repository: ClientPersonalReportRepository;
  fromCache: boolean;
  hasPendingWrites: boolean;
}
/** Scoped to one authenticated owner; disposing drops all local data and listeners. */
export function subscribePersonalReport(
  db: Firestore,
  uid: string,
  next: (snapshot: PersonalReportSnapshot) => void,
  fail: (error: Error) => void,
  requiredProjectIds: readonly string[] = [],
  calendarRange?: CalendarQueryRange,
): Unsubscribe {
  let disposed = false;
  let recordsReady = false;
  const projectTokens = new Map<string, object>();
  let records: ReportSourceRecord[] = [];
  let selectedIds: Set<string> | undefined;
  let recordsCache = true,
    recordsPending = false;
  const projects = new Map<string, ClientReportProject>();
  const subscriptions = new Map<string, Unsubscribe>();
  const states = new Map<string, { cache: boolean; pending: boolean }>();
  const emit = () => {
    if (disposed || !recordsReady || states.size !== subscriptions.size) return;
    next({
      repository: new ClientPersonalReportRepository(
        uid,
        [...records],
        new Map(projects),
        selectedIds,
      ),
      fromCache: recordsCache || [...states.values()].some((s) => s.cache),
      hasPendingWrites:
        recordsPending || [...states.values()].some((s) => s.pending),
    });
  };
  const recordStops: Unsubscribe[] = [];
  const stop = () => {
    disposed = true;
    for (const stop of recordStops) stop();
    for (const stop of subscriptions.values()) stop();
    subscriptions.clear();
    states.clear();
    projects.clear();
    records = [];
    batches.clear();
    projectTokens.clear();
    selectedIds = undefined;
    recordsReady = false;
  };
  const error = (e: Error) => {
    if (!disposed) {
      fail(e);
      stop();
    }
  };
  const contextQueries = calendarRange
    ? calendarRecordQueries(db, uid, calendarRange, true)
    : [collection(db, 'users', uid, 'records')];
  const selectionQueries = calendarRange?.projectId
    ? calendarRecordQueries(db, uid, calendarRange, false)
    : [];
  const queries = [...contextQueries, ...selectionQueries];
  const batches = new Map<number, QuerySnapshot<DocumentData>>();
  queries.forEach((q, index) =>
    recordStops.push(
      onSnapshot(
        q,
        { includeMetadataChanges: true },
        (batch) => {
          if (disposed) return;
          recordsReady = false;
          batches.set(index, batch);
          if (batches.size !== queries.length) return;
          const unique = new Map<string, QueryDocumentSnapshot<DocumentData>>();
          for (const [i, snapshot] of batches) {
            if (i >= contextQueries.length) continue;
            for (const d of snapshot.docs) {
              const previous = unique.get(d.id);
              if (
                previous &&
                JSON.stringify(previous.data()) !== JSON.stringify(d.data())
              )
                return;
              unique.set(d.id, d);
            }
          }
          selectedIds = selectionQueries.length
            ? new Set(
                [...batches]
                  .filter(([i]) => i >= contextQueries.length)
                  .flatMap(([, s]) => s.docs.map((d) => d.id)),
              )
            : undefined;
          if (selectedIds) {
            const expected = new Set(
              [...unique.values()]
                .filter((d) => d.data().projectId === calendarRange?.projectId)
                .map((d) => d.id),
            );
            if (
              expected.size !== selectedIds.size ||
              [...expected].some((id) => !selectedIds!.has(id))
            )
              return;
          }
          // A selected record can arrive before its context listener. Never calculate
          // a page with a missing or differing budget snapshot; wait for convergence.
          if (selectedIds)
            for (const [i, s] of batches) {
              if (i < contextQueries.length) continue;
              for (const d of s.docs) {
                const current = unique.get(d.id);
                if (
                  !current ||
                  JSON.stringify(current.data()) !== JSON.stringify(d.data())
                )
                  return;
              }
            }
          const snapshot = {
            docs: [...unique.values()],
            metadata: {
              fromCache: [...batches.values()].some(
                (s) => s.metadata.fromCache,
              ),
              hasPendingWrites: [...batches.values()].some(
                (s) => s.metadata.hasPendingWrites,
              ),
            },
          };
          if (disposed) return;
          try {
            records = snapshot.docs.flatMap((d) => {
              const data = d.data();
              if (data.deletedAt !== null && data.deletedAt !== undefined)
                return [];
              if (
                typeof data.projectId !== 'string' ||
                !/^[^/]+$/.test(data.projectId) ||
                typeof data.startedAt !== 'string' ||
                typeof data.timeZone !== 'string' ||
                (data.endedAt !== undefined && typeof data.endedAt !== 'string')
              )
                throw new Error('Contexto global contém registro inválido.');
              const topics = data.topics ?? [];
              if (
                !Array.isArray(topics) ||
                topics.some(
                  (t) =>
                    !t ||
                    typeof t.topicId !== 'string' ||
                    [t.percentage, t.durationMinutes].some(
                      (n) =>
                        n !== undefined &&
                        (typeof n !== 'number' || !Number.isFinite(n) || n < 0),
                    ),
                )
              )
                throw new Error('Contexto global contém tópicos inválidos.');
              return [
                {
                  id: d.id,
                  uid,
                  projectId: data.projectId,
                  startedAt: data.startedAt,
                  endedAt: data.endedAt,
                  timeZone: data.timeZone,
                  topics,
                },
              ];
            });
            recordsCache = snapshot.metadata.fromCache;
            recordsPending = snapshot.metadata.hasPendingWrites;
            const ids = new Set([
              ...requiredProjectIds,
              ...records.map((r) => r.projectId),
            ]);
            for (const [id, stop] of subscriptions)
              if (!ids.has(id)) {
                stop();
                subscriptions.delete(id);
                projectTokens.delete(id);
                states.delete(id);
                projects.delete(id);
              }
            for (const id of ids)
              if (!subscriptions.has(id)) {
                const token = {};
                projectTokens.set(id, token);
                subscriptions.set(id, () => {});
                const stop = onSnapshot(
                  doc(db, 'projects', id),
                  { includeMetadataChanges: true },
                  (p) => {
                    if (disposed || projectTokens.get(id) !== token) return;
                    const data = p.data();
                    if (data) {
                      projects.set(id, {
                        type:
                          typeof data.type === 'string'
                            ? data.type
                            : data.type === undefined
                              ? undefined
                              : '__invalid__',
                        createdBy:
                          typeof data.createdBy === 'string'
                            ? data.createdBy
                            : undefined,
                        archived: Boolean(data.archived),
                        mergedInto:
                          typeof data.mergedInto === 'string'
                            ? data.mergedInto
                            : undefined,
                        topics: Array.isArray(data.topics)
                          ? data.topics.filter(
                              (t) =>
                                t &&
                                typeof t.id === 'string' &&
                                typeof t.title === 'string',
                            )
                          : [],
                      });
                    } else projects.delete(id);
                    states.set(id, {
                      cache: p.metadata.fromCache,
                      pending: p.metadata.hasPendingWrites,
                    });
                    emit();
                  },
                  (e) => {
                    if (disposed || projectTokens.get(id) !== token) return;
                    if (
                      e.code !== 'permission-denied' &&
                      e.code !== 'not-found'
                    ) {
                      error(e);
                      return;
                    }
                    // A missing or inaccessible parent is excluded just as in the
                    // backend catalog. Never reuse its cached metadata after denial.
                    projectTokens.delete(id);
                    projects.delete(id);
                    states.set(id, { cache: false, pending: false });
                    subscriptions.get(id)?.();
                    emit();
                  },
                );
                subscriptions.set(id, stop);
              }
            recordsReady = true;
            emit();
          } catch (e) {
            error(e instanceof Error ? e : new Error(String(e)));
          }
        },
        error,
      ),
    ),
  );
  return stop;
}
