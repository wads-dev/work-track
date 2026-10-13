export type LocalDocument = { path: string; data: Record<string, unknown> };
export type WorkspaceSnapshot = {
  projects: { id: string; data: Record<string, unknown> }[];
  records: LocalDocument[];
  audits?: LocalDocument[];
  auditReady?: string[];
  completedProjects: string[];
  complete: boolean;
  syncing: boolean;
  error: string;
};
export const initialSnapshot = (): WorkspaceSnapshot => ({
  projects: [],
  records: [],
  audits: [],
  completedProjects: [],
  complete: false,
  syncing: true,
  error: '',
});
