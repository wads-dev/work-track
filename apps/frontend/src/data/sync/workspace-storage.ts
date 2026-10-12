/** The materialization and its cursor are one atomic IndexedDB value. No SDK LRU eviction. */
export type LocalDocument = { path: string; data: Record<string, unknown> };
export type WorkspaceData = {
  cursor?: number;
  projects: {
    id: string;
    data: Record<string, unknown>;
    generation?: string;
  }[];
  projectGenerations?: Record<string, string>;
  records: LocalDocument[];
  audits?: LocalDocument[];
  completedProjects: string[];
};
export interface WorkspaceStorage {
  load(): Promise<WorkspaceData>;
  save(data: WorkspaceData): Promise<void>;
  close(): void;
}
export const emptyWorkspace = (): WorkspaceData => ({
  projects: [],
  records: [],
  audits: [],
  completedProjects: [],
});
export function openWorkspaceStorage(
  namespace: string,
): Promise<WorkspaceStorage> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      'work-track-materialized-v1-' + namespace,
      1,
    );
    request.onupgradeneeded = () =>
      request.result.createObjectStore('workspace');
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error(
          'Cache local bloqueado por outra versão. Feche as outras abas.',
        ),
      );
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve({
        load: () =>
          new Promise((done, fail) => {
            const tx = db.transaction('workspace', 'readonly');
            const read = tx.objectStore('workspace').get('current');
            tx.oncomplete = () => {
              const data =
                (read.result as WorkspaceData | undefined) ?? emptyWorkspace();
              // Pre-audit caches need one full bootstrap, not a delta that misses old history.
              if (!data.audits) {
                data.audits = [];
                data.completedProjects = [];
                delete data.cursor;
              }
              done(data);
            };
            tx.onerror = () => fail(tx.error);
            tx.onabort = () => fail(tx.error);
          }),
        save: (data) =>
          new Promise((done, fail) => {
            const tx = db.transaction('workspace', 'readwrite');
            const store = tx.objectStore('workspace');
            const read = store.get('current');
            let conflict = false;
            read.onsuccess = () => {
              const prior = read.result as WorkspaceData | undefined;
              if ((prior?.cursor ?? -1) > (data.cursor ?? -1)) {
                conflict = true;
                tx.abort();
                return;
              }
              store.put(data, 'current');
            };
            tx.onabort = () =>
              fail(
                conflict
                  ? new Error('Cache avançou em outra aba; tente novamente.')
                  : tx.error,
              );
            tx.oncomplete = () => done();
            tx.onerror = () => fail(tx.error);
          }),
        close: () => db.close(),
      });
    };
  });
}
