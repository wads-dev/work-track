import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { observeWorkspace } from '../sync/workspace-runtime';
import {
  readProjectListing,
  emptyListing,
  type ListingResult,
  type ProjectReadOptions,
} from '../repositories/browser-listing-repository';
export interface ProjectSnapshot extends ListingResult {
  fromCache: boolean;
  hasPendingWrites: boolean;
  complete: boolean;
  refreshing?: boolean;
}
/** Synchronization signals readiness/content changes; it is never a UI dataset.
 * Each selection is a native SDK cache query, never another remote listener. */
export function subscribeAuthorizedProjects(
  db: Firestore,
  uid: string,
  next: (snapshot: ProjectSnapshot) => void,
  fail: () => void,
  options: ProjectReadOptions = {},
): Unsubscribe {
  let alive = true,
    generation = 0;
  const stop = observeWorkspace(db, uid, (snapshot) => {
    const epoch = generation + 1;
    if (snapshot.error) {
      generation++;
      fail();
      return;
    }
    generation = epoch;
    next({
      ...emptyListing,
      fromCache: true,
      hasPendingWrites: false,
      complete: false,
      refreshing: snapshot.complete,
    });
    if (!snapshot.complete) return;
    const ids = new Set(snapshot.completedProjects);
    void readProjectListing(db, uid, ids, options)
      .then((result) => {
        if (alive && epoch === generation)
          next({
            ...result,
            fromCache: false,
            hasPendingWrites: false,
            complete: true,
          });
      })
      .catch(() => {
        if (alive && epoch === generation) {
          fail();
        }
      });
  });
  return () => {
    alive = false;
    generation++;
    stop();
  };
}
