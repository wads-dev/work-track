export type LocalDocument = { path: string; data: Record<string, unknown> };
/** Notification only: screens query the SDK cache, never receive document copies. */
export type WorkspaceSignal = {
  /** Monotonic content revision; metadata-only confirmations do not change it. */
  dataRevision?: number;
  auditRevision?: number;
  completedProjects: string[];
  auditReady?: string[];
  complete: boolean;
  syncing: boolean;
  error: string;
};
/** Synthetic fixture input; production observers use WorkspaceSignal. */
export type WorkspaceSnapshot = {
  dataRevision?: number;
  auditRevision?: number;
  projects: { id: string; data: Record<string, unknown> }[];
  records: LocalDocument[];
  audits?: LocalDocument[];
  auditReady?: string[];
  completedProjects: string[];
  complete: boolean;
  syncing: boolean;
  error: string;
};
export const initialSnapshot = (): WorkspaceSignal => ({
  completedProjects: [],
  complete: false,
  syncing: true,
  error: '',
});
