import { useState, useSyncExternalStore, useCallback } from 'react';
import { type Firestore } from 'firebase/firestore';
import { subscribeAuthorizedOwnRecords } from './authorized-own-record-source';
import { ownRecordsRepository } from './own-records-repository';
export function useOwnRecords(db: Firestore, uid: string, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const subscribe = useCallback(
    (notify: () => void) =>
      enabled
        ? ownRecordsRepository.subscribe(
            db,
            uid,
            (next, error) =>
              subscribeAuthorizedOwnRecords(
                db,
                uid,
                (snapshot) => next(snapshot.rows, snapshot.fromCache),
                error,
              ),
            notify,
          )
        : () => {},
    [db, uid, attempt, enabled],
  );
  const state = useSyncExternalStore(subscribe, () =>
    ownRecordsRepository.snapshot(db, uid),
  );
  return {
    ...state,
    retry: () => {
      ownRecordsRepository.retry(db, uid);
      setAttempt((value) => value + 1);
    },
  };
}
