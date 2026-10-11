/** Lifecycle events only: project documents live in Firestore/IndexedDB, not a Promise cache. */
export function createProjectRepository() {
  const listeners = new Set<() => void>();
  let account = '';
  const invalidate = () => listeners.forEach((fn) => fn());
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    account(uid: string) {
      if (account !== uid) {
        account = uid;
        invalidate();
      }
    },
    invalidate,
  };
}
export const projectRepository = createProjectRepository();
