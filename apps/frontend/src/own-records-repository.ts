import type { Row } from './data';
import { isDeletedRecord, createDeletionObserver } from './record-deletion';
export type RecordSnapshot = {
  rows: Row[];
  loading: boolean;
  complete: boolean;
  fromCache: boolean;
  error: string;
};
export const emptyRecords: RecordSnapshot = {
  rows: [],
  loading: true,
  complete: false,
  fromCache: true,
  error: '',
};
type Connect = (
  next: (rows: Row[], fromCache: boolean) => void,
  error: () => void,
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
    ) {
      if (uid !== account) return () => {};
      let map = stores.get(owner);
      if (!map) {
        map = new Map();
        stores.set(owner, map);
      }
      let entry = map.get(uid);
      if (!entry) {
        entry = {
          state: emptyRecords,
          listeners: new Set(),
          stop: () => {},
          start: () => {},
        };
        map.set(uid, entry);
        const current = entry;
        const observeDeletion = createDeletionObserver(uid);
        current.start = () => {
          current.stop();
          current.state = emptyRecords;
          emit(current);
          const epoch = generation;
          let alive = true;
          const stop = connect(
            (rows, fromCache) => {
              if (!alive || epoch !== generation || uid !== account) return;
              observeDeletion(rows);
              current.state = {
                rows: rows.filter((row) => !isDeletedRecord(row.data)),
                loading: false,
                complete: !fromCache,
                fromCache,
                error: '',
              };
              emit(current);
            },
            () => {
              if (!alive || epoch !== generation || uid !== account) return;
              current.state = {
                ...emptyRecords,
                loading: false,
                error:
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
      return () => entry.listeners.delete(notify);
    },
    snapshot(owner: object, uid: string) {
      return uid === account
        ? (stores.get(owner)?.get(uid)?.state ?? emptyRecords)
        : emptyRecords;
    },
    retry(owner: object, uid: string) {
      if (uid === account) stores.get(owner)?.get(uid)?.start();
    },
  };
}
export const ownRecordsRepository = createOwnRecordsRepository();
