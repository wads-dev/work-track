export class StaleProjectResponse extends Error {}
// Every fetch MUST return the complete authorized ALL catalog; scope is derived by consumers.
export function createProjectRepository<T>() {
  let owners = new WeakMap<
    object,
    Map<string, { value?: T; pending?: Promise<T> }>
  >();
  const listeners = new Set<() => void>();
  let generation = 0;
  let account = '';
  const clear = () => {
    generation++;
    owners = new WeakMap();
    listeners.forEach((fn) => fn());
  };
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
        clear();
      }
    },
    invalidate: clear,
    load(
      owner: object,
      uid: string,
      _scope: string,
      fetch: () => Promise<T>,
    ): Promise<T> {
      let map = owners.get(owner);
      if (!map) {
        map = new Map();
        owners.set(owner, map);
      }
      const key = uid;
      const existing = map.get(key);
      if (existing?.value !== undefined) return Promise.resolve(existing.value);
      if (existing?.pending) return existing.pending;
      const epoch = generation;
      const entry: { value?: T; pending?: Promise<T> } = {};
      const pending = fetch().then(
        (value) => {
          if (epoch !== generation) throw new StaleProjectResponse();
          if (map.get(key) === entry) {
            entry.value = value;
            entry.pending = undefined;
          }
          return value;
        },
        (error) => {
          if (map.get(key) === entry) map.delete(key);
          throw error;
        },
      );
      entry.pending = pending;
      map.set(key, entry);
      return pending;
    },
  };
}
export const projectRepository =
  createProjectRepository<Record<string, unknown>[]>();
