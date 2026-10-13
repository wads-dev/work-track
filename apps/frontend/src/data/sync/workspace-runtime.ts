import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { openWorkspaceStorage } from './workspace-storage';
import {
  createWorkspaceSync,
  initialSnapshot,
  type WorkspaceSnapshot,
  type SyncInput,
  type SyncResponse,
} from './workspace-sync';
import { invalidateProjectAccess } from '../cache/project-access-revision';
const entries = new WeakMap<
  Firestore,
  {
    uid: string;
    snapshot: WorkspaceSnapshot;
    notify: Set<(snapshot: WorkspaceSnapshot) => void>;
    retry: () => void;
  }
>();
const pending = new WeakMap<
  Firestore,
  Set<(snapshot: WorkspaceSnapshot) => void>
>();
/** Local observers never start network work. Only the authenticated root owns the synchronizer. */
export function observeWorkspace(
  db: Firestore,
  uid: string,
  next: (snapshot: WorkspaceSnapshot) => void,
) {
  let observers = pending.get(db);
  if (!observers) {
    observers = new Set();
    pending.set(db, observers);
  }
  const guarded = (value: WorkspaceSnapshot) =>
    next(entries.get(db)?.uid === uid ? value : initialSnapshot());
  observers.add(guarded);
  guarded(entries.get(db)?.snapshot ?? initialSnapshot());
  return () => {
    observers.delete(guarded);
  };
}
export function workspaceRetry(db: Firestore, uid: string) {
  const entry = entries.get(db);
  if (entry?.uid === uid) entry.retry();
}
export function startWorkspaceSession(db: Firestore, uid: string) {
  let stopped = false;
  let cleanup = () => {};
  const entry = {
    uid,
    snapshot: initialSnapshot(),
    notify: pending.get(db) ?? new Set<(snapshot: WorkspaceSnapshot) => void>(),
    retry: () => {},
  };
  pending.set(db, entry.notify);
  entries.set(db, entry);
  entry.notify.forEach((fn) => fn(entry.snapshot));
  // origin separates production, localhost and every isolated emulator frontend port.
  const namespace = encodeURIComponent(
    location.origin + ':' + db.app.options.projectId + ':' + uid,
  );
  let opening = false;
  const open = () => {
    if (stopped || opening) return;
    opening = true;
    void openWorkspaceStorage(namespace)
      .then((storage) => {
        opening = false;
        if (stopped) {
          storage.close();
          return;
        }
        const call = httpsCallable<SyncInput, SyncResponse>(
          getFunctions(db.app, 'southamerica-east1'),
          'syncWorkspace',
        );
        const sync = createWorkspaceSync(
          uid,
          storage,
          {
            pull: async (input) => {
              const result = (await call(input)).data;
              // DevTools evidence: counters only, never payloads/UID/texts.
              console.debug('[Work Track sync]', {
                phase: input.bootstrap ? 'bootstrap' : 'delta',
                cursor: input.cursor ?? null,
                nextCursor: result.cursor,
                head: result.head,
                events: result.events.length,
                documents: result.bootstrap?.rows.length ?? 0,
              });
              return result;
            },
            listen: (changed, failed) =>
              onSnapshot(
                doc(db, 'webSyncState', 'head'),
                { includeMetadataChanges: true },
                (s) => {
                  if (!s.metadata.fromCache) changed();
                },
                failed,
              ),
          },
          async (work) => {
            // Serialize cache+cursor across tabs; each pull reloads disk under the same lock.
            if (!navigator.locks)
              throw new Error(
                'Este navegador não oferece Web Locks; sincronização interrompida para proteger o cache entre abas.',
              );
            return navigator.locks.request(
              'work-track-sync-' + namespace,
              work,
            );
          },
        );
        let signature: string | undefined;
        const stopObserve = sync.subscribe((snapshot) => {
          if (stopped) return;
          const nextSignature = JSON.stringify(snapshot.projects);
          entry.snapshot = snapshot;
          if (signature !== undefined && signature !== nextSignature)
            invalidateProjectAccess();
          signature = nextSignature;
          entry.notify.forEach((fn) => fn(snapshot));
        });
        entry.retry = sync.retry;
        const focus = () =>
          sync.focus(
            document.visibilityState === 'visible' && document.hasFocus(),
          );
        document.addEventListener('visibilitychange', focus);
        window.addEventListener('focus', focus);
        window.addEventListener('blur', focus);
        window.addEventListener('online', sync.retry);
        focus();
        cleanup = () => {
          document.removeEventListener('visibilitychange', focus);
          window.removeEventListener('focus', focus);
          window.removeEventListener('blur', focus);
          window.removeEventListener('online', sync.retry);
          stopObserve();
          sync.dispose();
        };
      })
      .catch((error: unknown) => {
        opening = false;
        if (stopped) return;
        entry.retry = open;
        entry.snapshot = {
          ...initialSnapshot(),
          syncing: false,
          error:
            error instanceof Error
              ? error.message
              : 'IndexedDB indisponível. Nenhuma leitura remota alternativa foi feita.',
        };
        entry.notify.forEach((fn) => fn(entry.snapshot));
      });
  };
  entry.retry = open;
  open();
  return () => {
    stopped = true;
    cleanup();
    if (entries.get(db) === entry) entries.delete(db);
    entry.notify.forEach((fn) => fn(initialSnapshot()));
  };
}
