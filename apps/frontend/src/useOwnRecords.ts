import { useState, useSyncExternalStore, useCallback } from 'react';
import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
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
              onSnapshot(
                collection(db, 'users', uid, 'records'),
                { includeMetadataChanges: true },
                (snapshot) =>
                  next(
                    snapshot.docs.map((doc) => ({
                      id: doc.id,
                      data: doc.data(),
                    })),
                    snapshot.metadata.fromCache,
                  ),
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
