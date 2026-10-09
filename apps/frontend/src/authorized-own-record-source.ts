import {
  collection,
  doc,
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
import { getFunctions, httpsCallable } from 'firebase/functions';
import { projectRepository } from './project-repository';
import { loadAllProjects, type ProjectPage } from './project-list';
import { canAccessProject } from '../../backend/src/modules/registration/domain/project-access';
import type { Row } from './data';
export interface OwnRecordPage {
  rows: Row[];
  fromCache: boolean;
  hasMore: boolean;
  cursor: string;
}
/** Typed live catalogs plus paginated authorized known-ID discovery for legacy projects.
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
  let catalogReady = false;
  let generation = 0;
  const legacy = new Map<
    string,
    { stop: Unsubscribe; ready: boolean; authorized: boolean; cache: boolean }
  >();
  const catalogs = new Map<number, Set<string>>();
  const catalogCache = new Map<number, boolean>();
  const stops: Unsubscribe[] = [];
  const groups = new Map<
    string,
    { stop: Unsubscribe; rows?: Row[]; cache: boolean }
  >();
  const stop = () => {
    disposed = true;
    generation++;
    legacy.forEach((parent) => parent.stop());
    legacy.clear();
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
      !catalogReady ||
      [...legacy.values()].some((parent) => !parent.ready) ||
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
        [...legacy.values()].some((parent) => parent.cache) ||
        [...groups.values()].some((g) => g.cache),
      hasMore: Boolean(options.size && all.length >= options.size),
      cursor: rows.at(-1)?.id ?? options.after ?? '',
    });
  };
  const reconcile = () => {
    if (disposed || catalogs.size !== 2) return;
    const ids = new Set([
      ...[...catalogs.values()].flatMap((s) => [...s]),
      ...[...legacy]
        .filter(([, parent]) => parent.authorized)
        .map(([id]) => id),
    ]);
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
  const functions = getFunctions(db.app, 'southamerica-east1');
  const loadCatalog = () => {
    if (disposed) return;
    const current = ++generation;
    catalogReady = false;
    legacy.forEach((parent) => parent.stop());
    legacy.clear();
    reconcile();
    void projectRepository
      .load(functions, uid, 'all', () =>
        loadAllProjects(
          async (cursor) =>
            (
              await httpsCallable<
                {
                  scope: 'all';
                  limit: number;
                  includeArchived: boolean;
                  cursor?: string;
                },
                ProjectPage
              >(
                functions,
                'listProjects',
              )({
                scope: 'all',
                limit: 100,
                includeArchived: true,
                ...(cursor ? { cursor } : {}),
              })
            ).data,
        ),
      )
      .then((projects) => {
        if (disposed || generation !== current) return;
        for (const project of projects) {
          if (project.type !== undefined) continue;
          const id = project.id;
          if (typeof id !== 'string' || !id || id.includes('/')) {
            error();
            return;
          }
          if (legacy.has(id)) continue;
          const parent = {
            stop: (() => {}) as Unsubscribe,
            ready: false,
            authorized: false,
            cache: true,
          };
          legacy.set(id, parent);
          parent.stop = onSnapshot(
            doc(db, 'projects', id),
            { includeMetadataChanges: true },
            (snapshot) => {
              if (
                disposed ||
                generation !== current ||
                legacy.get(id) !== parent
              )
                return;
              parent.ready = true;
              parent.authorized =
                snapshot.exists() && canAccessProject(snapshot.data(), uid);
              parent.cache =
                snapshot.metadata.fromCache ||
                snapshot.metadata.hasPendingWrites;
              reconcile();
            },
            () => {
              if (
                !disposed &&
                generation === current &&
                legacy.get(id) === parent
              )
                error();
            },
          );
        }
        catalogReady = true;
        reconcile();
      })
      .catch(() => {
        if (!disposed && generation === current) error();
      });
  };
  stops.push(projectRepository.subscribe(loadCatalog));
  loadCatalog();
  return stop;
}
