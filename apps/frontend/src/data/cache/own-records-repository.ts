import { projectAccessRevision } from './project-access-revision';
import { deletionRevision } from './record-deletion';
import type { Row } from '../../shared/data';
import { isDeletedRecord, createDeletionObserver } from './record-deletion';
import {
  emptyListing,
  type ListingResult,
} from '../repositories/browser-listing-repository';
export type RecordSnapshot = ListingResult & {
  rows: Row[];
  loading: boolean;
  complete: boolean;
  fromCache: boolean;
  error: string;
};
export const emptyRecords: RecordSnapshot = {
  ...emptyListing,
  rows: [],
  loading: true,
  complete: false,
  fromCache: true,
  error: '',
};
type Connect = (
  next: (
    rows: Row[],
    fromCache: boolean,
    listing?: ListingResult & { refreshing?: boolean },
  ) => void,
  error: (message?: string) => void,
) => () => void;
type Entry = {
  state: RecordSnapshot;
  listeners: Set<() => void>;
  stop: () => void;
  start: () => void;
};
export function createOwnRecordsRepository() {
  let stores = new WeakMap<object, Map<string, Entry>>();
  const active = new Set<Entry>();
  let generation = 0;
  let account = '';
  const emit = (entry: Entry) => entry.listeners.forEach((fn) => fn());
  const purge = () => {
    generation++;
    for (const entry of active) {
      entry.stop();
      entry.state = emptyRecords;
      emit(entry);
    }
    active.clear();
    stores = new WeakMap();
  };
  return {
    account(uid: string) {
      if (account !== uid) {
        account = uid;
        purge();
      }
    },
    purge,
    invalidate() {
      generation++;
      for (const entry of active) entry.start();
    },
    subscribe(
      owner: object,
      uid: string,
      connect: Connect,
      notify: () => void,
      key = '',
    ) {
      if (uid !== account) return () => {};
      let map = stores.get(owner);
      if (!map) {
        map = new Map();
        stores.set(owner, map);
      }
      const cacheKey = uid + ':' + key;
      let entry = map.get(cacheKey);
      if (!entry) {
        entry = {
          state: emptyRecords,
          listeners: new Set(),
          stop: () => {},
          start: () => {},
        };
        map.set(cacheKey, entry);
        const current = entry;
        const observeDeletion = createDeletionObserver(uid);
        let accessRevision = -1,
          recordRevision = -1;
        const retain = () =>
          accessRevision === projectAccessRevision() &&
          recordRevision === deletionRevision(uid);
        current.start = () => {
          current.stop();
          current.state =
            retain() && !current.state.error
              ? { ...current.state, loading: true }
              : emptyRecords;
          emit(current);
          const epoch = generation;
          let alive = true;
          const stop = connect(
            (rows, fromCache, listing) => {
              if (!alive || epoch !== generation || uid !== account) return;
              if (listing?.refreshing && retain()) {
                current.state = { ...current.state, loading: true };
                emit(current);
                return;
              }
              observeDeletion(rows);
              accessRevision = projectAccessRevision();
              recordRevision = deletionRevision(uid);
              // Native listings already exclude tombstones; retain lifecycle
              // validation for legacy raw connectors, with coherent totals.
              const visible = listing
                ? rows
                : rows.filter((row) => !isDeletedRecord(row.data));
              current.state = {
                ...(listing ?? { ...emptyListing, total: visible.length }),
                rows: visible,
                loading: fromCache,
                complete: !fromCache,
                fromCache,
                error: '',
              };
              emit(current);
            },
            (message) => {
              if (!alive || epoch !== generation || uid !== account) return;
              current.state = {
                ...emptyRecords,
                loading: false,
                error:
                  message ??
                  'Não foi possível carregar o histórico. Verifique a conexão e tente novamente.',
              };
              emit(current);
            },
          );
          current.stop = () => {
            alive = false;
            stop();
          };
        };
        active.add(entry);
        entry.start();
      }
      entry.listeners.add(notify);
      return () => {
        entry.listeners.delete(notify);
        if (entry.listeners.size === 0) {
          entry.stop();
          entry.state = emptyRecords;
          active.delete(entry);
          map.delete(cacheKey);
        }
      };
    },
    snapshot(owner: object, uid: string, key = '') {
      return uid === account
        ? (stores.get(owner)?.get(uid + ':' + key)?.state ?? emptyRecords)
        : emptyRecords;
    },
    retry(owner: object, uid: string, key = '') {
      if (uid === account)
        stores
          .get(owner)
          ?.get(uid + ':' + key)
          ?.start();
    },
  };
}
export const ownRecordsRepository = createOwnRecordsRepository();
