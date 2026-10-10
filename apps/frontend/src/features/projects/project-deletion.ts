export type DeletionBackup = { snapshotToken: string; exportData: unknown };
export type DeletionState = {
  busy: 'export' | 'delete' | null;
  backup: DeletionBackup | null;
  saved: boolean;
  typed: string;
  reason: string;
  error: string;
  deleted: boolean;
};
export function ownsVisibleProject(
  uid: string,
  project: Record<string, unknown> | undefined,
  hidden: boolean,
) {
  return !!uid && !hidden && !!project && project.createdBy === uid;
}
export function confirmationMatches(
  value: string,
  projectId: string,
  title: string,
) {
  return value === projectId || (!!title && value === title);
}
export function createProjectDeletion(options: {
  projectId: string;
  title: string;
  current: () => boolean;
  exportProject: () => Promise<DeletionBackup>;
  download: (data: unknown) => void;
  deleteProject: (
    backup: DeletionBackup,
    requestId: string,
    reason: string,
  ) => Promise<unknown>;
  onDeleted: () => void;
  onChange: () => void;
  requestId: () => string;
}) {
  const initial = (): DeletionState => ({
    busy: null,
    backup: null,
    saved: false,
    typed: '',
    reason: '',
    error: '',
    deleted: false,
  });
  let state = initial();
  let epoch = 0;
  let disposed = false;
  let intent: { key: string; id: string } | null = null;
  const valid = (generation = epoch) =>
    !disposed && generation === epoch && options.current();
  const emit = () => {
    if (!disposed) options.onChange();
  };
  const canDelete = () =>
    valid() &&
    !state.busy &&
    !state.deleted &&
    !!state.backup &&
    state.saved &&
    !!state.reason.trim() &&
    confirmationMatches(state.typed, options.projectId, options.title);
  return {
    snapshot: () => state,
    canDelete,
    confirm(saved: boolean, typed: string, reason: string) {
      if (!valid() || state.busy) return;
      state = { ...state, saved, typed, reason };
      emit();
    },
    reset() {
      epoch++;
      state = initial();
      intent = null;
      emit();
    },
    dispose() {
      disposed = true;
      epoch++;
      state = initial();
    },
    async download() {
      if (!valid() || state.busy || state.deleted) return;
      const generation = epoch;
      intent = null;
      state = { ...initial(), busy: 'export' };
      emit();
      try {
        const backup = await options.exportProject();
        if (!valid(generation)) return;
        if (
          !backup.snapshotToken ||
          backup.exportData === null ||
          backup.exportData === undefined
        )
          throw new Error('Exportação completa inválida.');
        options.download(backup.exportData);
        if (!valid(generation)) return;
        state = { ...initial(), backup };
      } catch {
        if (!valid(generation)) return;
        state = {
          ...initial(),
          error:
            'Não foi possível exportar e iniciar o download. Baixe um novo JSON antes de excluir.',
        };
      }
      if (valid(generation)) emit();
    },
    async delete() {
      if (!canDelete()) return;
      const generation = epoch;
      const backup = state.backup!;
      const reason = state.reason.trim();
      const key = JSON.stringify([backup.snapshotToken, reason]);
      if (intent?.key !== key) intent = { key, id: options.requestId() };
      state = { ...state, busy: 'delete', error: '' };
      emit();
      try {
        await options.deleteProject(backup, intent.id, reason);
        if (!valid(generation)) return;
        state = { ...initial(), deleted: true };
        emit();
        options.onDeleted();
      } catch (failure) {
        if (!valid(generation)) return;
        const code = (failure as { code?: string })?.code;
        // Any failed precondition invalidates the snapshot, including expiry or drift.
        if (
          code === 'functions/failed-precondition' ||
          code === 'failed-precondition'
        ) {
          intent = null;
          state = {
            ...initial(),
            error:
              'Os dados mudaram ou o backup expirou. Exporte e baixe um novo JSON; confirme novamente.',
          };
        } else {
          state = {
            ...state,
            busy: null,
            error:
              'A exclusão não foi confirmada pelo servidor. Você pode tentar novamente com o mesmo backup, ou cancelar. Nenhuma nova exclusão será iniciada automaticamente.',
          };
        }
        emit();
      }
    },
  };
}

// A click returning successfully proves initiation only, never persistence to disk.
export function downloadProjectJson(
  data: unknown,
  projectId: string,
  environment = {
    document: globalThis.document,
    createObjectURL: (blob: Blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url: string) => URL.revokeObjectURL(url),
    defer: (cleanup: () => void) => {
      setTimeout(cleanup, 60_000);
    },
  },
) {
  const json = JSON.stringify(data, null, 2);
  if (!json) throw new Error('JSON vazio.');
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = environment.createObjectURL(blob);
  let anchor: HTMLAnchorElement | undefined;
  let initiated = false;
  try {
    anchor = environment.document.createElement('a');
    anchor.href = url;
    anchor.download =
      'project-backup-' + projectId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
    environment.document.body.appendChild(anchor);
    anchor.click();
    initiated = true;
  } finally {
    anchor?.remove();
    if (initiated) environment.defer(() => environment.revokeObjectURL(url));
    else environment.revokeObjectURL(url);
  }
}
