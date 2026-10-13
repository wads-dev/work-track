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
import {
  initialSnapshot,
  type WorkspaceSnapshot,
  type LocalDocument,
} from './workspace-sync';
const entries = new WeakMap<
  Firestore,
  { uid: string; snapshot: WorkspaceSnapshot; retry: () => void }
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
  const guarded = (s: WorkspaceSnapshot) =>
    next(entries.get(db)?.uid === uid ? s : initialSnapshot());
  set.add(guarded);
  guarded(entries.get(db)?.snapshot ?? initialSnapshot());
  return () => {
    set.delete(guarded);
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
    focused = false,
    authorized = false;
  const entry = { uid, snapshot: initialSnapshot(), retry: () => {} };
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
    entry.snapshot = {
      ...initialSnapshot(),
      syncing: false,
      error:
        error instanceof Error
          ? error.message
          : 'Falha na sincronização Firestore.',
    };
    authorized = false;
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
      projects.every((p) => ready.has('records:' + p.id)) &&
      [...auditStops.keys()].every((path) => ready.has('audit:' + path));
    entry.snapshot = {
      projects: complete ? projects : [],
      records: complete ? [...records.values()].flat() : [],
      audits: complete ? [...audits.values()].flat() : [],
      completedProjects: complete ? projects.map((p) => p.id) : [],
      complete,
      syncing: !complete,
      error: '',
    };
    emit();
  };
  // Local listener supplies all data. Default listener exists ONLY for SDK synchronization.
  const watch = (
    target: Query<DocumentData>,
    key: string,
    receive: (rows: LocalDocument[]) => void,
  ) => {
    const token = epoch;
    let live = true,
      confirmed = false,
      serial = 0;
    const current = () => live && !disposed && token === epoch;
    const readLocal = async () => {
      const turn = ++serial;
      try {
        const s = await getDocsFromCache(target);
        if (!current() || turn !== serial) return;
        if (confirmed) ready.add(key);
        receive(s.docs.map((d) => ({ path: d.ref.path, data: d.data() })));
        publish();
      } catch (error) {
        if (current()) fail(error);
      }
    };
    const local = onSnapshot(
      target,
      { source: 'cache', includeMetadataChanges: true },
      () => {
        if (current()) void readLocal();
      },
      (error) => {
        if (current()) fail(error);
      },
    );
    const remote = onSnapshot(
      target,
      { includeMetadataChanges: true },
      (s) => {
        if (!current()) return;
        if (!s.metadata.fromCache && !s.metadata.hasPendingWrites) {
          confirmed = true;
          authorized = focused;
          void readLocal();
        }
      },
      (error) => {
        if (current()) fail(error);
      },
    );
    return () => {
      live = false;
      serial++;
      local();
      remote();
      ready.delete(key);
    };
  };
  const reconcileAudits = () => {
    const parents = [...records.values()]
      .flat()
      .filter((r) => r.data.uid === uid && !isDeletedRecord(r.data));
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
    const ids = new Set(projects.map((p) => p.path.split('/').at(-1)!));
    for (const [id, stop] of projectStops)
      if (!ids.has(id)) {
        stop();
        projectStops.delete(id);
        records.delete(id);
        invalidateProjectAccess();
      }
    for (const id of ids)
      if (!projectStops.has(id))
        projectStops.set(
          id,
          watch(
            query(collectionGroup(db, 'records'), where('projectId', '==', id)),
            'records:' + id,
            (rows) => {
              records.set(id, rows);
              reconcileAudits();
              publish();
            },
          ),
        );
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
    // Keep query targets/resume tokens alive; SDK handles IndexedDB and multi-tab synchronization.
    if (next) void enableNetwork(db).catch(fail);
    else {
      authorized = false;
      entry.snapshot = initialSnapshot();
      emit();
      void disableNetwork(db).catch(fail);
    }
  };
  entry.retry = () => {
    if (disposed) return;
    start();
    if (focused) void enableNetwork(db).catch(fail);
  };
  start();
  document.addEventListener('visibilitychange', focus);
  window.addEventListener('focus', focus);
  window.addEventListener('blur', focus);
  window.addEventListener('online', entry.retry);
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
    window.removeEventListener('online', entry.retry);
    if (entries.get(db) === entry) entries.delete(db);
    observers.get(db)?.forEach((fn) => fn(initialSnapshot()));
  };
}
