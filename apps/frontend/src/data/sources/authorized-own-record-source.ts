import {
  collection,
  query,
  where,
  orderBy,
  documentId,
  startAfter,
  limit,
  onSnapshot,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { subscribeAuthorizedProjects } from './authorized-project-source';
import type { Row } from '../../shared/data';
export interface OwnRecordPage {
  rows: Row[];
  fromCache: boolean;
  hasMore: boolean;
  cursor: string;
}
/** Project-scoped reads only. Complete owner history is not truncated; paginated callers bound each query. */
export function subscribeAuthorizedOwnRecords(
  db: Firestore,
  uid: string,
  next: (page: OwnRecordPage) => void,
  fail: () => void,
  options: { size?: number; after?: string; openOnly?: boolean } = {},
): Unsubscribe {
  let disposed = false;
  let catalogCache = true;
  let catalogReady = false;
  let stopCatalog: Unsubscribe = () => {};
  const groups = new Map<
    string,
    { stop: Unsubscribe; rows?: Row[]; cache: boolean }
  >();
  const stop = () => {
    if (disposed) return;
    disposed = true;
    stopCatalog();
    groups.forEach((group) => group.stop());
    groups.clear();
  };
  const error = () => {
    if (!disposed) {
      stop();
      fail();
    }
  };
  const emit = () => {
    if (disposed || [...groups.values()].some((group) => !group.rows)) return;
    const all = [...groups.values()]
      .flatMap((group) => group.rows!)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rows = options.size ? all.slice(0, options.size) : all;
    next({
      rows,
      fromCache:
        catalogCache || [...groups.values()].some((group) => group.cache),
      hasMore: Boolean(options.size && all.length >= options.size),
      cursor: rows.at(-1)?.id ?? options.after ?? '',
    });
  };
  stopCatalog = subscribeAuthorizedProjects(
    db,
    uid,
    (snapshot) => {
      if (disposed) return;
      // An unconfirmed empty disk snapshot is not a complete empty owner history.
      catalogReady ||= snapshot.complete;
      if (!catalogReady) return;
      catalogCache = snapshot.fromCache || snapshot.hasPendingWrites;
      const ids = new Set(snapshot.rows.map((row) => row.id));
      for (const [id, group] of groups)
        if (!ids.has(id)) {
          group.stop();
          groups.delete(id);
        }
      for (const id of ids)
        if (!groups.has(id)) {
          const group = {
            stop: (() => {}) as Unsubscribe,
            rows: undefined as Row[] | undefined,
            cache: true,
          };
          groups.set(id, group);
          group.stop = onSnapshot(
            query(
              collection(db, 'users', uid, 'records'),
              where('projectId', '==', id),
              ...(options.openOnly ? [where('endedAt', '==', null)] : []),
              orderBy(documentId()),
              ...(options.after ? [startAfter(options.after)] : []),
              ...(options.size ? [limit(options.size)] : []),
            ),
            { includeMetadataChanges: true },
            (recordSnapshot) => {
              if (disposed || groups.get(id) !== group) return;
              group.rows = recordSnapshot.docs.map((document) => ({
                id: document.id,
                data: document.data(),
              }));
              group.cache =
                recordSnapshot.metadata.fromCache ||
                recordSnapshot.metadata.hasPendingWrites;
              emit();
            },
            () => {
              if (!disposed && groups.get(id) === group) error();
            },
          );
        }
      // Drop revoked rows immediately while new authorized branches hydrate.
      if ([...groups.values()].some((group) => !group.rows))
        next({
          rows: [],
          fromCache: true,
          hasMore: false,
          cursor: options.after ?? '',
        });
      emit();
    },
    error,
  );
  if (disposed) stopCatalog();
  return stop;
}
