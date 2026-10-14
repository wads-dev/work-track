import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { observeWorkspace } from '../sync/workspace-runtime';
import {
  readOwnRecordListing,
  emptyListing,
  type ListingResult,
  type OwnRecordReadOptions,
} from '../repositories/browser-listing-repository';
export interface OwnRecordPage extends ListingResult {
  fromCache: boolean;
  refreshing?: boolean;
}
/** UI parameters select from native persistent cache after session readiness.
 * Generation guards discard queries superseded by a content/ACL/account change. */
export function subscribeAuthorizedOwnRecords(
  db: Firestore,
  uid: string,
  next: (page: OwnRecordPage) => void,
  fail: (message?: string) => void,
  options: OwnRecordReadOptions = {},
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
      cursor: options.after ?? '',
      fromCache: true,
      refreshing: snapshot.complete,
    });
    if (!snapshot.complete) return;
    const ids = new Set(snapshot.completedProjects);
    void readOwnRecordListing(db, uid, ids, options)
      .then((result) => {
        if (alive && epoch === generation)
          next({ ...result, fromCache: false });
      })
      .catch((error) => {
        if (alive && epoch === generation) {
          fail(error instanceof Error ? error.message : undefined);
        }
      });
  });
  return () => {
    alive = false;
    generation++;
    stop();
  };
}
