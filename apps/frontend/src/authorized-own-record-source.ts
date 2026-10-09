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
import type { Row } from './data';
export interface OwnRecordPage {
  rows: Row[];
  fromCache: boolean;
  hasMore: boolean;
  cursor: string;
}
/** Explicit-type catalog only: legacy projects without type require a known-ID path.
 * Page limits apply globally after merging; each authorized project transfers at most
 * the page size. Owner history deliberately has no limit, but no unscoped record query.
 */
export function subscribeAuthorizedOwnRecords(
  db: Firestore,
  uid: string,
  next: (page: OwnRecordPage) => void,
  fail: () => void,
  options: { size?: number; after?: string } = {},
): Unsubscribe {
  let disposed = false;
  const catalogs = new Map<number, Set<string>>();
  const catalogCache = new Map<number, boolean>();
  const stops: Unsubscribe[] = [];
  const groups = new Map<
    string,
    { stop: Unsubscribe; rows?: Row[]; cache: boolean }
  >();
  const stop = () => {
    disposed = true;
    stops.forEach((s) => s());
    groups.forEach((g) => g.stop());
    groups.clear();
    catalogs.clear();
  };
  const error = () => {
    if (!disposed) {
      fail();
      stop();
    }
  };
  const emit = () => {
    if (
      disposed ||
      catalogs.size !== 2 ||
      [...groups.values()].some((g) => !g.rows)
    )
      return;
    const all = [...groups.values()]
      .flatMap((g) => g.rows!)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rows = options.size ? all.slice(0, options.size) : all;
    next({
      rows,
      fromCache:
        [...catalogCache.values()].some(Boolean) ||
        [...groups.values()].some((g) => g.cache),
      hasMore: Boolean(options.size && all.length >= options.size),
      cursor: rows.at(-1)?.id ?? options.after ?? '',
    });
  };
  const reconcile = () => {
    if (catalogs.size !== 2) return;
    const ids = new Set([...catalogs.values()].flatMap((s) => [...s]));
    for (const [id, g] of groups)
      if (!ids.has(id)) {
        g.stop();
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
            orderBy(documentId()),
            ...(options.after ? [startAfter(options.after)] : []),
            ...(options.size ? [limit(options.size)] : []),
          ),
          { includeMetadataChanges: true },
          (s) => {
            if (disposed || groups.get(id) !== group) return;
            group.rows = s.docs.map((d) => ({ id: d.id, data: d.data() }));
            group.cache = s.metadata.fromCache || s.metadata.hasPendingWrites;
            emit();
          },
          error,
        );
      }
    // A revocation removes rows immediately, even while new branches hydrate.
    if ([...groups.values()].some((g) => !g.rows))
      next({
        rows: [],
        fromCache: true,
        hasMore: false,
        cursor: options.after ?? '',
      });
    emit();
  };
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
          catalogs.set(i, new Set(s.docs.map((d) => d.id)));
          catalogCache.set(
            i,
            s.metadata.fromCache || s.metadata.hasPendingWrites,
          );
          reconcile();
        },
        error,
      ),
    ),
  );
  return stop;
}
