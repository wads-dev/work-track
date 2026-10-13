export const FIRESTORE_DOCUMENT_METRIC_KEYS = {
  localReads: 'work-track:firestore:local-doc-reads',
  remoteReads: 'work-track:firestore:remote-doc-reads',
  writes: 'work-track:firestore:doc-writes',
} as const;
export type DocumentMetrics = {
  localReads: number;
  remoteReads: number;
  writes: number;
};
let pending: Promise<void> = Promise.resolve();
let initializedStorage: Storage | undefined;
export function readDocumentMetrics(): DocumentMetrics | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return Object.fromEntries(
      Object.entries(FIRESTORE_DOCUMENT_METRIC_KEYS).map(([name, key]) => {
        const value = Number(localStorage.getItem(key) ?? 0);
        return [name, Number.isSafeInteger(value) && value >= 0 ? value : 0];
      }),
    ) as DocumentMetrics;
  } catch {
    return null;
  }
}
export function accumulateDocumentMetrics(delta: Partial<DocumentMetrics>) {
  if (typeof window === 'undefined') return;
  Object.assign(window, {
    __workTrackFirestoreMetrics: {
      keys: FIRESTORE_DOCUMENT_METRIC_KEYS,
      read: readDocumentMetrics,
      flush: () => pending,
    },
  });
  const hasIncrement = Object.values(delta).some(
    (value) => Number.isSafeInteger(value) && Number(value) > 0,
  );
  let storage: Storage;
  try {
    storage = localStorage;
  } catch {
    return;
  }
  if (initializedStorage === storage && !hasIncrement) return;
  const save = () => {
    try {
      const current = readDocumentMetrics();
      if (!current) return;
      for (const name of Object.keys(
        FIRESTORE_DOCUMENT_METRIC_KEYS,
      ) as (keyof DocumentMetrics)[]) {
        const amount = delta[name] ?? 0;
        const increment =
          Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
        if (initializedStorage !== storage || increment)
          localStorage.setItem(
            FIRESTORE_DOCUMENT_METRIC_KEYS[name],
            String(
              Math.min(Number.MAX_SAFE_INTEGER, current[name] + increment),
            ),
          );
      }
      initializedStorage = storage;
    } catch {
      /* Diagnostics must never fail an application operation. */
    }
  };
  // Serialize cross-tab read-modify-write without another storage key or Firestore I/O.
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    pending = pending
      .then(() =>
        navigator.locks.request('work-track:firestore-document-metrics', save),
      )
      .catch(() => {});
  } else save();
}
