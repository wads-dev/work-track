import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { observeWorkspace } from '../sync/workspace-runtime';
import type { Row } from '../../shared/data';
export interface ProjectSnapshot {
  rows: Row[];
  fromCache: boolean;
  hasPendingWrites: boolean;
  complete: boolean;
}
/** UI reads are local; session synchronization owns all remote work. */
export function subscribeAuthorizedProjects(
  db: Firestore,
  uid: string,
  next: (snapshot: ProjectSnapshot) => void,
  fail: () => void,
): Unsubscribe {
  return observeWorkspace(db, uid, (snapshot) => {
    if (snapshot.error) {
      fail();
      return;
    }
    next({
      rows: snapshot.complete ? snapshot.projects : [],
      fromCache: !snapshot.complete,
      hasPendingWrites: false,
      complete: snapshot.complete,
    });
  });
}
