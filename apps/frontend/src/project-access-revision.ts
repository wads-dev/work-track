import { useSyncExternalStore } from 'react';
import { projectRepository } from './project-repository';
let revision = 0;
const listeners = new Set<() => void>();
export function invalidateProjectAccess() {
  revision++;
  listeners.forEach((fn) => fn());
}
export function projectAccessRevision() {
  return revision;
}
export function useProjectAccessRevision() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    projectAccessRevision,
    projectAccessRevision,
  );
}
projectRepository.subscribe(invalidateProjectAccess);
