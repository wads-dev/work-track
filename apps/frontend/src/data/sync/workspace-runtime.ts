import {
  collection,
  collectionGroup,
  query,
  where,
  onSnapshot,
  getDocsFromCache,
  disableNetwork,
  enableNetwork,
  type Firestore,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { invalidateProjectAccess } from '../cache/project-access-revision';
import { traceFirestore } from './firestore-diagnostics';
import {
  initialSnapshot,
  type WorkspaceSnapshot,
  type LocalDocument,
} from './workspace-sync';
const entries = new WeakMap<
  Firestore,
  {
    uid: string;
    snapshot: WorkspaceSnapshot;
    retry: () => void;
    audit: (path: string) => () => void;
  }
>();
const observers = new WeakMap<
  Firestore,
  Set<(snapshot: WorkspaceSnapshot) => void>
>();
export function observeWorkspace(
  db: Firestore,
  uid: string,
  next: (snapshot: WorkspaceSnapshot) => void,
) {
  let set = observers.get(db);
  if (!set) {
    set = new Set();
    observers.set(db, set);
  }
  const guarded = (s: WorkspaceSnapshot) => {
    traceFirestore('local.workspace.read', {
      collection: 'projects,records',
      projects: s.projects.length,
      records: s.records.length,
      complete: s.complete,
    });
    next(entries.get(db)?.uid === uid ? s : initialSnapshot());
  };
  set.add(guarded);
  guarded(entries.get(db)?.snapshot ?? initialSnapshot());
  return () => {
    set.delete(guarded);
  };
}
export function observeWorkspaceAudit(
  db: Firestore,
  uid: string,
  parentPath: string,
  next: (snapshot: WorkspaceSnapshot) => void,
) {
  let currentEntry: ReturnType<typeof entries.get>;
  let release = () => {};
  const stop = observeWorkspace(db, uid, (snapshot) => {
    const entry = entries.get(db);
    if (entry?.uid === uid && entry !== currentEntry) {
      release();
      currentEntry = entry;
      release = entry.audit(parentPath);
    }
    next(snapshot);
  });
  return () => {
    stop();
    release();
  };
}
export function workspaceRetry(db: Firestore, uid: string) {
  const entry = entries.get(db);
  if (entry?.uid === uid) entry.retry();
}
/** One native SDK synchronization lifetime per authenticated app, never per route/date. */
export function startWorkspaceSession(db: Firestore, uid: string) {
  let disposed = false,
    epoch = 0,
    focused = document.visibilityState === 'visible' && document.hasFocus(),
    authorized = false;
  const entry = {
    uid,
    snapshot: initialSnapshot(),
    retry: () => {},
    audit: (path: string): (() => void) => {
      void path;
      return () => {};
    },
  };
  const requestedAudits = new Map<string, number>();
  let publishedKey = '';
  entries.set(db, entry);
  const emit = () => {
    if (!disposed) observers.get(db)?.forEach((fn) => fn(entry.snapshot));
  };
  const catalog = new Map<number, LocalDocument[]>();
  const ready = new Set<string>();
  const records = new Map<string, LocalDocument[]>();
  const audits = new Map<string, LocalDocument[]>();
  const projectStops = new Map<string, () => void>();
  const auditStops = new Map<string, () => void>();
  let catalogStops: (() => void)[] = [];

  const fail = (error: unknown) => {
    if (disposed) return;
    epoch++;
    catalogStops.forEach((stop) => stop());
    projectStops.forEach((stop) => stop());
    auditStops.forEach((stop) => stop());
    catalogStops = [];
    projectStops.clear();
    auditStops.clear();
    ready.clear();
    traceFirestore('error', {
      message: error instanceof Error ? error.message : String(error),
    });
    entry.snapshot = {
      ...initialSnapshot(),
      syncing: false,
      error:
        error instanceof Error
          ? error.message
          : 'Falha na sincronização Firestore.',
    };
    authorized = false;
    publishedKey = '';
    emit();
  };
  const publish = () => {
    if (disposed || !authorized) return;
    const projects = [
      ...new Map(
        [...catalog.values()]
          .flat()
          .filter((p) => canAccessProject(p.data, uid))
          .map((p) => [
            p.path.split('/').at(-1)!,
            { id: p.path.split('/').at(-1)!, data: p.data },
          ]),
      ).values(),
    ];
    const complete =
      ready.has('catalog:0') &&
      ready.has('catalog:1') &&
      [...projectStops.keys()].every((key) => ready.has(key));
    const nextSnapshot: WorkspaceSnapshot = {
      projects: complete ? projects : [],
      records: complete ? [...records.values()].flat() : [],
      audits: complete ? [...audits.values()].flat() : [],
      auditReady: [...auditStops.keys()].filter((path) =>
        ready.has('audit:' + path),
      ),
      completedProjects: complete ? projects.map((p) => p.id) : [],
      complete,
      syncing: !complete,
      error: '',
    };
    const key = JSON.stringify(nextSnapshot);
    if (key === publishedKey) return;
    publishedKey = key;
    entry.snapshot = nextSnapshot;
    traceFirestore('workspace.return', {
      projects: nextSnapshot.projects.length,
      records: nextSnapshot.records.length,
      complete,
      local: true,
    });
    emit();
  };
  // One SDK listener signals changes. Every document materialization is cache-only.
  const watch = (
    target: Query<DocumentData>,
    key: string,
    receive: (rows: LocalDocument[]) => void,
  ) => {
    const collectionName = key.startsWith('catalog:')
      ? 'projects'
      : key.startsWith('records:')
        ? 'records'
        : 'audit';
    traceFirestore('listen.attach', {
      key,
      collection: collectionName,
      remote: true,
    });
    const token = epoch;
    let live = true,
      confirmed = false,
      serial = 0;
    const current = () => live && !disposed && token === epoch;
    const readLocal = async () => {
      const turn = ++serial;
      try {
        traceFirestore('cache.read', {
          key,
          collection: collectionName,
          source: 'persistent-local',
        });
        const s = await getDocsFromCache(target);
        traceFirestore('cache.result', {
          key,
          collection: collectionName,
          count: s.size,
          source: 'persistent-local',
        });
        if (!current() || turn !== serial) return;
        if (confirmed) ready.add(key);
        const rows = s.docs.map((d) => ({ path: d.ref.path, data: d.data() }));
        traceFirestore('cache.filtered', {
          key,
          count: rows.length,
          scanned: s.size,
          local: true,
        });
        receive(rows);
        publish();
      } catch (error) {
        if (current()) fail(error);
      }
    };
    const remote = onSnapshot(
      target,
      { includeMetadataChanges: true },
      (s) => {
        if (!current()) return;
        traceFirestore('listen.event', {
          key,
          collection: collectionName,
          count: s.size,
          fromCache: s.metadata.fromCache,
          pending: s.metadata.hasPendingWrites,
          changed: s.docChanges().length,
          // Removed docs and local-write echoes are not documents read remotely.
          // Warm metadata-only confirmations must never add the entire result size.
          documentsRead: s.metadata.fromCache
            ? 0
            : s
                .docChanges()
                .filter(
                  (change) =>
                    change.type !== 'removed' &&
                    !change.doc.metadata.hasPendingWrites,
                ).length,
          source: s.metadata.fromCache ? 'local' : 'remote',
        });
        if (!s.metadata.fromCache && !s.metadata.hasPendingWrites) {
          confirmed = true;
          authorized = true;
        }
        void readLocal();
        traceFirestore('listen.return', {
          key,
          collection: collectionName,
          notifiedLocal: true,
        });
      },
      (error) => {
        traceFirestore('listen.error', { key, message: error.message });
        if (current()) fail(error);
      },
    );
    return () => {
      traceFirestore('listen.detach', { key });
      live = false;
      serial++;
      remote();
      ready.delete(key);
    };
  };
  const reconcileAudits = () => {
    const parents = [...records.values()]
      .flat()
      .filter(
        (r) =>
          requestedAudits.has(r.path) &&
          r.data.uid === uid &&
          !isDeletedRecord(r.data),
      );
    const paths = new Set(parents.map((r) => r.path));
    for (const [path, stop] of auditStops)
      if (!paths.has(path)) {
        stop();
        auditStops.delete(path);
        audits.delete(path);
      }
    for (const parent of parents)
      if (!auditStops.has(parent.path))
        auditStops.set(
          parent.path,
          watch(
            query(collection(db, parent.path + '/audit')),
            'audit:' + parent.path,
            (rows) => {
              audits.set(parent.path, rows);
              publish();
            },
          ),
        );
  };
  const reconcile = () => {
    if (!ready.has('catalog:0') || !ready.has('catalog:1')) return;
    const projects = [
      ...new Map(
        [...catalog.values()]
          .flat()
          .filter((p) => canAccessProject(p.data, uid))
          .map((p) => [p.path.split('/').at(-1)!, p]),
      ).values(),
    ];
    const ids = projects.map((p) => p.path.split('/').at(-1)!).sort();
    // Rules permit only authorized project IDs, and allow at most ten distinct
    // parent get() calls per query. These global groups do not depend on views.
    const groups = new Map<string, string[]>();
    for (let offset = 0; offset < ids.length; offset += 10) {
      const group = ids.slice(offset, offset + 10);
      groups.set('records:' + group.join(','), group);
    }
    for (const [key, stop] of projectStops) {
      if (!groups.has(key)) {
        stop();
        projectStops.delete(key);
        records.delete(key);
        invalidateProjectAccess();
      }
    }
    for (const [key, ids] of groups)
      if (!projectStops.has(key)) {
        projectStops.set(
          key,
          watch(
            query(
              collectionGroup(db, 'records'),
              where('projectId', 'in', ids),
            ),
            key,
            (rows) => {
              records.set(key, rows);
              reconcileAudits();
            },
          ),
        );
      }
    reconcileAudits();
    publish();
  };
  const start = () => {
    epoch++;
    catalogStops.forEach((s) => s());
    projectStops.forEach((s) => s());
    auditStops.forEach((s) => s());
    catalogStops = [];
    projectStops.clear();
    auditStops.clear();
    catalog.clear();
    records.clear();
    audits.clear();
    ready.clear();
    authorized = false;
    entry.snapshot = initialSnapshot();
    publishedKey = '';
    emit();
    [
      query(collection(db, 'projects'), where('type', '==', 'work')),
      query(collection(db, 'projects'), where('createdBy', '==', uid)),
    ].forEach((target, i) =>
      catalogStops.push(
        watch(target, 'catalog:' + i, (rows) => {
          catalog.set(i, rows);
          reconcile();
        }),
      ),
    );
  };
  const focus = () => {
    const next = document.visibilityState === 'visible' && document.hasFocus();
    if (next === focused || disposed) return;
    focused = next;
    traceFirestore('network.focus', { focused });
    // Keep query targets/resume tokens alive; SDK handles IndexedDB and multi-tab synchronization.
    if (next) {
      void enableNetwork(db).catch(fail);
    } else {
      // Transport suspension must not blank already-authorized local views.
      void disableNetwork(db).catch(fail);
    }
  };
  entry.audit = (path) => {
    if (
      !path.startsWith('users/' + uid + '/records/') ||
      path.split('/').length !== 4
    )
      return () => {};
    requestedAudits.set(path, (requestedAudits.get(path) ?? 0) + 1);
    reconcileAudits();
    return () => {
      const count = (requestedAudits.get(path) ?? 1) - 1;
      if (count > 0) requestedAudits.set(path, count);
      else requestedAudits.delete(path);
      reconcileAudits();
      publish();
    };
  };
  entry.retry = () => {
    if (disposed) return;
    start();
  };
  if (!focused) void disableNetwork(db).catch(fail);
  start();
  document.addEventListener('visibilitychange', focus);
  window.addEventListener('focus', focus);
  window.addEventListener('blur', focus);
  const online = () => traceFirestore('network.online', { focused });
  // SDK owns reconnect; online must never rebootstrap targets or blank views.
  window.addEventListener('online', online);
  focus();
  return () => {
    disposed = true;
    epoch++;
    catalogStops.forEach((s) => s());
    projectStops.forEach((s) => s());
    auditStops.forEach((s) => s());
    document.removeEventListener('visibilitychange', focus);
    window.removeEventListener('focus', focus);
    window.removeEventListener('blur', focus);
    window.removeEventListener('online', online);
    if (entries.get(db) === entry) entries.delete(db);
    observers.get(db)?.forEach((fn) => fn(initialSnapshot()));
  };
}
