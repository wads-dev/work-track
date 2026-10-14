import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { observeWorkspace } from '../sync/workspace-runtime';
import { stableDataKey } from '../repositories/stable-data-key';
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
    generation = 0,
    signature = '';
  const stop = observeWorkspace(db, uid, (snapshot) => {
    const epoch = generation + 1;
    if (snapshot.error) {
      signature = '';
      generation++;
      fail();
      return;
    }
    const key = stableDataKey({
      complete: snapshot.complete,
      projects: snapshot.projects,
      records: snapshot.records,
    });
    if (signature === key) return;
    signature = key;
    generation = epoch;
    next({
      ...emptyListing,
      fromCache: true,
      hasPendingWrites: false,
      complete: false,
      refreshing: snapshot.complete,
    });
    if (!snapshot.complete) return;
    const ids = new Set(snapshot.projects.map((project) => project.id));
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
          signature = '';
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
