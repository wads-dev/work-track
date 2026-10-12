import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import {
  emptyWorkspace,
  type WorkspaceData,
  type WorkspaceStorage,
  type LocalDocument,
} from './workspace-storage';
export type SyncInput = {
  cursor?: number;
  bootstrap?: { projectId: string; after?: string };
};
export type SyncResponse = {
  projects: WorkspaceData['projects'];
  events: {
    revision: number;
    path: string;
    data: Record<string, unknown> | null;
  }[];
  cursor: number;
  head: number;
  hasMore: boolean;
  bootstrap?: {
    projectId: string;
    rows: LocalDocument[];
    after: string | null;
  };
};
export type WorkspaceSnapshot = WorkspaceData & {
  complete: boolean;
  syncing: boolean;
  error: string;
};
export interface SyncTransport {
  pull(input: SyncInput): Promise<SyncResponse>;
  listen(changed: () => void, failed: (error: Error) => void): () => void;
}
export const initialSnapshot = (): WorkspaceSnapshot => ({
  ...emptyWorkspace(),
  complete: false,
  syncing: true,
  error: '',
});
/** No route, date or UI filter is an input to synchronization. */
export function createWorkspaceSync(
  uid: string,
  storage: WorkspaceStorage,
  transport: SyncTransport,
  lock: <T>(work: () => Promise<T>) => Promise<T> = (work) => work(),
) {
  let snapshot = initialSnapshot();
  const listeners = new Set<(value: WorkspaceSnapshot) => void>();
  let disposed = false,
    focused = false,
    epoch = 0,
    running = false,
    requested = false;
  let stopHead: () => void = () => {};
  const emit = () => {
    if (!disposed) listeners.forEach((next) => next(snapshot));
  };
  const fence = () => {
    snapshot = { ...initialSnapshot(), syncing: focused };
    emit();
  };
  const fail = (error: unknown) => {
    if (disposed) return;
    snapshot = {
      ...initialSnapshot(),
      syncing: false,
      error:
        error instanceof Error
          ? error.message
          : 'Falha na sincronização local.',
    };
    emit();
  };
  const current = (token: number) => !disposed && focused && token === epoch;
  const applyCatalog = (data: WorkspaceData, response: SyncResponse) => {
    const projects = response.projects.filter((p) =>
      canAccessProject(p.data, uid),
    );
    const ids = new Set(projects.map((p) => p.id));
    const generations = data.projectGenerations ?? {};
    const valid = new Set(
      projects
        .filter((p) => !p.generation || generations[p.id] === p.generation)
        .map((p) => p.id),
    );
    data.completedProjects = data.completedProjects.filter((id) =>
      valid.has(id),
    );
    data.projects = projects;
    data.records = data.records.filter((r) =>
      ids.has(String(r.data.projectId)),
    );
    data.completedProjects = data.completedProjects.filter((id) => ids.has(id));
    const parents = new Set(
      data.records.filter((r) => !isDeletedRecord(r.data)).map((r) => r.path),
    );
    data.audits = (data.audits ?? []).filter((a) =>
      parents.has(a.path.split('/').slice(0, 4).join('/')),
    );
  };
  const applyEvents = (data: WorkspaceData, response: SyncResponse) => {
    if (
      !Number.isSafeInteger(response.cursor) ||
      response.cursor < (data.cursor ?? 0) ||
      response.cursor > response.head
    )
      throw new Error(
        'Cursor de sincronização inválido. Nenhum total parcial foi publicado.',
      );
    const records = new Map(data.records.map((r) => [r.path, r]));
    const ids = new Set(data.projects.map((p) => p.id));
    const audits = new Map((data.audits ?? []).map((a) => [a.path, a]));
    for (const event of response.events) {
      if (
        event.revision <= (data.cursor ?? 0) ||
        event.revision > response.cursor
      )
        continue;
      const parts = event.path.split('/');
      if (parts.length === 6 && parts[4] === 'audit' && parts[1] === uid) {
        if (event.data)
          audits.set(event.path, { path: event.path, data: event.data });
        else audits.delete(event.path);
        continue;
      }
      if (parts.length !== 4 || parts[0] !== 'users' || parts[2] !== 'records')
        continue;
      if (event.data && ids.has(String(event.data.projectId)))
        records.set(event.path, { path: event.path, data: event.data });
      else records.delete(event.path);
    }
    data.records = [...records.values()];
    const parents = new Set(
      data.records.filter((r) => !isDeletedRecord(r.data)).map((r) => r.path),
    );
    data.audits = [...audits.values()].filter((a) =>
      parents.has(a.path.split('/').slice(0, 4).join('/')),
    );
    data.cursor = response.cursor;
  };
  const synchronize = async (token: number) =>
    lock(async () => {
      if (!current(token)) return;
      const data = await storage.load();
      data.audits ??= [];
      if (!current(token)) return;
      let response = await transport.pull({
        ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
      });
      if (!current(token)) return;
      applyCatalog(data, response);
      // Freeze the initial boundary BEFORE bootstrap. Replay changes after it, including deletes.
      if (data.cursor === undefined) data.cursor = response.cursor;
      // Do not apply/advance a delta yet: a grant needs its whole project snapshot first.
      for (;;) {
        const missing = data.projects.find(
          (p) => !data.completedProjects.includes(p.id),
        );
        if (!missing) break;
        const id = missing.id;
        const generation = missing.generation;
        data.records = data.records.filter((r) => r.data.projectId !== id);
        const retainedParents = new Set(data.records.map((r) => r.path));
        data.audits = data.audits.filter((a) =>
          retainedParents.has(a.path.split('/').slice(0, 4).join('/')),
        );
        let after: string | undefined;
        do {
          const page = await transport.pull({
            cursor: data.cursor,
            bootstrap: { projectId: id, ...(after ? { after } : {}) },
          });
          if (!current(token)) return;
          applyCatalog(data, page);
          const batch = page.bootstrap;
          if (!batch || batch.projectId !== id)
            throw new Error(
              'Bootstrap incompleto; nenhum relatório parcial será exibido.',
            );
          if (!data.projects.some((p) => p.id === id)) break;
          const records = new Map(data.records.map((r) => [r.path, r]));
          const audits: Map<string, LocalDocument> = new Map(
            (data.audits ?? []).map((r) => [r.path, r]),
          );
          if (data.projects.find((p) => p.id === id)?.generation !== generation)
            throw new Error(
              'Escopo alterado durante bootstrap; tente novamente.',
            );
          for (const row of batch.rows) {
            const parts = row.path.split('/');
            if (
              parts.length === 6 &&
              parts[4] === 'audit' &&
              parts[1] === uid
            ) {
              audits.set(row.path, row);
              continue;
            }
            if (row.data.projectId !== id || parts[1] !== row.data.uid)
              throw new Error('Registro de sincronização inválido.');
            records.set(row.path, row);
          }
          data.records = [...records.values()];
          data.audits = [...audits.values()];
          if (batch.after && batch.after === after)
            throw new Error('Paginação de sincronização não avançou.');
          after = batch.after ?? undefined;
        } while (after);
        if (data.projects.some((p) => p.id === id)) {
          data.completedProjects.push(id);
          data.projectGenerations = {
            ...data.projectGenerations,
            [id]: generation ?? '',
          };
        }
        // Incomplete bootstrap is never saved. Interrupted work restarts only this project.
        await storage.save(data);
        response = await transport.pull({ cursor: data.cursor });
        if (!current(token)) return;
        applyCatalog(data, response);
      }
      for (;;) {
        if (!current(token)) return;
        applyCatalog(data, response);
        if (data.projects.some((p) => !data.completedProjects.includes(p.id))) {
          requested = true;
          await storage.save(data);
          return;
        }
        applyEvents(data, response);
        // One transaction includes rows + deletions + checkpoint. Publish only after durable save.
        await storage.save(data);
        if (!current(token)) return;
        if (!response.hasMore) {
          if (data.cursor !== response.head)
            throw new Error(
              'Journal incompleto: cursor não alcançou a revisão confirmada.',
            );
          break;
        }
        response = await transport.pull({ cursor: data.cursor });
      }
      if (!current(token)) return;
      snapshot = { ...data, complete: true, syncing: false, error: '' };
      emit();
    });
  const drain = async () => {
    if (running || disposed || !focused) return;
    running = true;
    try {
      while (requested && focused && !disposed) {
        requested = false;
        const token = epoch;
        try {
          await synchronize(token);
        } catch (error) {
          if (current(token)) fail(error);
        }
      }
    } finally {
      running = false;
    }
  };
  let headFailed = false;
  const connectHead = () => {
    stopHead();
    const token = epoch;
    headFailed = false;
    stopHead = transport.listen(
      () => {
        if (current(token)) request();
      },
      (error) => {
        if (!current(token)) return;
        headFailed = true;
        epoch++; // Fence in-flight pulls after the SDK terminates this listener.
        fail(error);
      },
    );
  };
  const request = () => {
    if (!disposed && focused) {
      requested = true;
      void drain();
    }
  };
  return {
    snapshot: () => snapshot,
    subscribe(next: (value: WorkspaceSnapshot) => void) {
      listeners.add(next);
      next(snapshot);
      return () => {
        listeners.delete(next);
      };
    },
    focus(value: boolean) {
      if (disposed || focused === value) return;
      focused = value;
      epoch++;
      stopHead();
      stopHead = () => {};
      // Authorization may have changed while unfocused: fail closed until revalidated.
      fence();
      if (value) {
        connectHead();
        request();
      }
    },
    retry() {
      if (focused && !disposed && headFailed) connectHead();
      request();
    },
    dispose() {
      disposed = true;
      focused = false;
      epoch++;
      stopHead();
      listeners.clear();
      storage.close();
      snapshot = initialSnapshot();
    },
  };
}
