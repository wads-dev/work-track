import { useSyncExternalStore } from 'react';
import { projectRepository } from './project-repository';
let generation = 0;
let account: string | null = null;
export function deletionAccount(uid: string) {
  if (account !== uid) {
    account = uid;
    generation++;
    revisions.clear();
    subscribers.forEach((set) => set.forEach((fn) => fn()));
  }
}
export function isDeletedRecord(data: Record<string, unknown>) {
  return data.deletedAt !== null && data.deletedAt !== undefined;
}
const revisions = new Map<string, number>();
const subscribers = new Map<string, Set<() => void>>();
export const deletionRevision = (uid: string) => revisions.get(uid) ?? 0;
export function useDeletionRevision(uid: string) {
  return useSyncExternalStore(
    (notify) => {
      let set = subscribers.get(uid);
      if (!set) {
        set = new Set();
        subscribers.set(uid, set);
      }
      set.add(notify);
      return () => {
        set.delete(notify);
        if (!set.size) subscribers.delete(uid);
      };
    },
    () => deletionRevision(uid),
  );
}
export function notifyRecordDeletion(uid: string) {
  if (account !== null && uid !== account) return;
  revisions.set(uid, deletionRevision(uid) + 1);
  projectRepository.invalidate();
  subscribers.get(uid)?.forEach((fn) => fn());
}
export function createDeletionObserver(uid: string) {
  const epoch = generation;
  let previous = new Set<string>();
  return (rows: { id: string; data: Record<string, unknown> }[]) => {
    if (epoch !== generation || (account !== null && uid !== account)) return;
    const deleted = rows.some(
      (row) => previous.has(row.id) && isDeletedRecord(row.data),
    );
    previous = new Set(
      rows.filter((row) => !isDeletedRecord(row.data)).map((row) => row.id),
    );
    if (deleted) {
      notifyRecordDeletion(uid);
    }
  };
}
