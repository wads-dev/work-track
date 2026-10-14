import { useMemo, useSyncExternalStore, useCallback } from 'react';
import { type Firestore } from 'firebase/firestore';
import { workspaceRetry } from '../../../data/sync/workspace-runtime';
import { subscribeAuthorizedOwnRecords } from '../../../data/sources/authorized-own-record-source';
import {
  ownRecordsRepository,
  emptyRecords,
} from '../../../data/cache/own-records-repository';
import {
  listingKey,
  type OwnRecordReadOptions,
} from '../../../data/repositories/browser-listing-repository';
export function useOwnRecords(
  db: Firestore,
  uid: string,
  enabled = true,
  options: OwnRecordReadOptions = {},
) {
  const key = listingKey({ ...options, includeDeleted: false });
  const selection = useMemo(
    () => JSON.parse(key) as OwnRecordReadOptions,
    [key],
  );
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
                (snapshot) => next(snapshot.rows, snapshot.fromCache, snapshot),
                error,
                selection,
              ),
            notify,
            key,
          )
        : () => {},
    [db, uid, enabled, key, selection],
  );
  const state = useSyncExternalStore(subscribe, () =>
    enabled ? ownRecordsRepository.snapshot(db, uid, key) : emptyRecords,
  );
  return {
    ...state,
    retry: () => {
      if (state.error) workspaceRetry(db, uid);
      ownRecordsRepository.retry(db, uid, key);
    },
  };
}
