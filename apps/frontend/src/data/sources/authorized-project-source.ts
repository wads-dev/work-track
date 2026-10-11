import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { ProjectDiscoveryRepository } from '@work-track/data/repositories/project-discovery-repository';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { invalidateProjectAccess } from '../cache/project-access-revision';
import type { Row } from '../../shared/data';

export interface ProjectSnapshot {
  rows: Row[];
  fromCache: boolean;
  hasPendingWrites: boolean;
  complete: boolean;
}
type Branch = { rows: Row[]; fromCache: boolean; pending: boolean };
/** Read locally through cache listeners; default listeners synchronize the same authorized queries.
 * Snapshot projections last only while subscribed. No Callable catalog or retained Promise cache. */
export function subscribeAuthorizedProjects(
  db: Firestore,
  uid: string,
  next: (snapshot: ProjectSnapshot) => void,
  fail: () => void,
): Unsubscribe {
  let disposed = false;
  let legacyReady = false;
  const legacyRows = new Map<string, Row>();
  const legacyReceived = new Set<string>();
  const stops: Unsubscribe[] = [];
  const branches = new Map<number, Branch>();
  // Disk cache is shared across accounts. Require a current server authorization
  // for each query before exposing a previous session's project metadata.
  const authorized = new Set<number>();
  let fingerprint: string | undefined;
  const stop = () => {
    if (disposed) return;
    disposed = true;
    stops.forEach((unsubscribe) => unsubscribe());
    branches.clear();
    authorized.clear();
  };
  const error = () => {
    if (!disposed) {
      stop();
      invalidateProjectAccess();
      fail();
    }
  };
  const emit = () => {
    if (disposed || branches.size !== 2 || !legacyReady) return;
    const rows =
      authorized.size === 2
        ? [
            ...new Map(
              ProjectDiscoveryRepository.authorized(
                [...branches.values()]
                  .flatMap((branch) => branch.rows)
                  .concat([...legacyRows.values()]),
                uid,
              ).map((row) => [row.id, row]),
            ).values(),
          ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        : [];
    const signature = JSON.stringify(rows);
    if (fingerprint !== undefined && fingerprint !== signature)
      invalidateProjectAccess();
    fingerprint = signature;
    const fromCache = [...branches.values()].some((branch) => branch.fromCache);
    const hasPendingWrites = [...branches.values()].some(
      (branch) => branch.pending,
    );
    next({
      rows,
      fromCache,
      hasPendingWrites,
      complete: !fromCache && !hasPendingWrites,
    });
  };
  if (!uid) {
    next({
      rows: [],
      fromCache: true,
      hasPendingWrites: false,
      complete: false,
    });
    return stop;
  }
  // Missing fields cannot be queried in Firestore. Server returns only authorized IDs; live document reads remain protected by Rules.
  void httpsCallable<Record<string, never>, { ids: string[] }>(
    getFunctions(db.app, 'southamerica-east1'),
    'discoverLegacyProjectIds',
  )({})
    .then((result) => {
      if (disposed) return;
      const ids = [...new Set(result.data.ids)];
      if (!ids.length) {
        legacyReady = true;
        emit();
        return;
      }
      for (const id of ids)
        stops.push(
          onSnapshot(
            doc(db, 'projects', id),
            { includeMetadataChanges: true },
            (snapshot) => {
              if (disposed) return;
              const data = snapshot.data();
              if (data && canAccessProject(data, uid))
                legacyRows.set(id, { id, data });
              else legacyRows.delete(id);
              if (!snapshot.metadata.fromCache) {
                legacyReceived.add(id);
                legacyReady = legacyReceived.size === ids.length;
              }
              emit();
            },
            error,
          ),
        );
    })
    .catch(error);
  [
    query(collection(db, 'projects'), where('type', '==', 'work')),
    query(
      collection(db, 'projects'),
      where('type', '==', 'personal'),
      where('createdBy', '==', uid),
    ),
  ].forEach((target, index) => {
    let live = false;
    for (const source of ['cache', 'default'] as const)
      stops.push(
        onSnapshot(
          target,
          { source, includeMetadataChanges: true },
          (snapshot) => {
            if (disposed || (source === 'cache' && live)) return;
            if (source === 'default') {
              live = true;
              if (
                !snapshot.metadata.fromCache &&
                !snapshot.metadata.hasPendingWrites
              )
                authorized.add(index);
            }
            const rows = snapshot.docs.flatMap((document) => {
              const data = document.data();
              // IndexedDB is storage, not proof of authorization. Verify even cached documents.
              const expected =
                index === 0
                  ? data.type === 'work'
                  : data.type === 'personal' && data.createdBy === uid;
              return expected && canAccessProject(data, uid)
                ? [{ id: document.id, data: { ...data, id: document.id } }]
                : [];
            });
            branches.set(index, {
              rows,
              fromCache: snapshot.metadata.fromCache,
              pending: snapshot.metadata.hasPendingWrites,
            });
            emit();
          },
          error,
        ),
      );
  });
  return stop;
}
