import { vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import type { WorkspaceSnapshot } from '../sync/workspace-sync';

export interface CacheDocument {
  path: string;
  data: Record<string, unknown>;
}
export interface CacheConstraint {
  kind?: 'orderBy' | 'limit';
  field?: string;
  op?: string;
  value?: unknown;
  direction?: 'asc' | 'desc';
  count?: number;
}
export interface CacheQuery {
  base: string | { group: string };
  constraints: CacheConstraint[];
}
const compare = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  const rank = (v: unknown) =>
    v === null
      ? 0
      : typeof v === 'boolean'
        ? 1
        : typeof v === 'number'
          ? 2
          : typeof v === 'string'
            ? 3
            : 4;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string' && typeof b === 'string') {
    const left = new TextEncoder().encode(a),
      right = new TextEncoder().encode(b);
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return left.length - right.length;
  }
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1;
  if (typeof a === 'boolean' && typeof b === 'boolean')
    return Number(a) - Number(b);
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : 1;
};

/** Firebase-shaped local-only fixture: predicates execute before readers receive rows.
 * Missing fields do not match null and orderBy/inequalities exclude missing fields.
 * Collection IDs and collection-group document names intentionally differ.
 */
const comparePaths = (a: string, b: string) => {
  const left = a.split('/'),
    right = b.split('/');
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const d = compare(left[i], right[i]);
    if (d) return d;
  }
  return left.length - right.length;
};
export function createNativeCacheFixture() {
  let documents: CacheDocument[] = [];
  const observers: {
    uid: string;
    next: (value: WorkspaceSnapshot) => void;
    stop: ReturnType<typeof vi.fn>;
    active: boolean;
  }[] = [];
  const evaluate = (target: CacheQuery) => {
    const group = typeof target.base !== 'string';
    const field = (doc: CacheDocument, name: string) =>
      name === '__name__'
        ? group
          ? doc.path
          : doc.path.split('/').at(-1)
        : doc.data[name];
    let selected = documents.filter((doc) =>
      group
        ? doc.path.split('/').at(-2) ===
          (target.base as { group: string }).group
        : doc.path.slice(0, doc.path.lastIndexOf('/')) === target.base,
    );
    for (const clause of target.constraints) {
      if (clause.kind === 'limit') continue;
      selected = selected.filter((doc) => {
        const value = field(doc, clause.field!);
        const compareValue = (candidate: unknown) =>
          clause.field === '__name__' && group
            ? comparePaths(String(value), String(candidate))
            : compare(value, candidate);
        if (value === undefined) return false;
        if (clause.kind === 'orderBy') return true;
        switch (clause.op) {
          case '==':
            return compareValue(clause.value) === 0;
          case '!=':
            return compareValue(clause.value) !== 0;
          case 'in':
            return (clause.value as unknown[]).some(
              (candidate) => compareValue(candidate) === 0,
            );
          case '>':
            return compareValue(clause.value) > 0;
          case '>=':
            return compareValue(clause.value) >= 0;
          case '<':
            return compareValue(clause.value) < 0;
          case '<=':
            return compareValue(clause.value) <= 0;
          default:
            throw new Error('Unsupported fixture predicate: ' + clause.op);
        }
      });
    }
    const ordering = target.constraints.filter((c) => c.kind === 'orderBy');
    selected.sort((a, b) => {
      for (const clause of ordering) {
        const diff =
          clause.field === '__name__' && group
            ? comparePaths(a.path, b.path)
            : compare(field(a, clause.field!), field(b, clause.field!));
        if (diff) return clause.direction === 'desc' ? -diff : diff;
      }
      return comparePaths(a.path, b.path);
    });
    const maximum = target.constraints.find((c) => c.kind === 'limit')?.count;
    if (maximum !== undefined) selected = selected.slice(0, maximum);
    const docs = selected.map((doc) => {
      const data = structuredClone(doc.data);
      return {
        id: doc.path.split('/').at(-1)!,
        ref: { path: doc.path },
        data: () => structuredClone(data),
        exists: () => true,
        metadata: { fromCache: true, hasPendingWrites: false },
      };
    });
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
      metadata: { fromCache: true, hasPendingWrites: false },
    };
  };
  const getDocsFromCache = vi.fn(async (target: CacheQuery) =>
    evaluate(target),
  );
  const onSnapshot = vi.fn();
  const getDocs = vi.fn();
  const getDocsFromServer = vi.fn();
  const getDoc = vi.fn();
  const callable = vi.fn();
  const observe = vi.fn(
    (_db: Firestore, uid: string, next: (value: WorkspaceSnapshot) => void) => {
      const observer = {
        uid,
        next,
        active: true,
        stop: vi.fn(() => {
          observer.active = false;
        }),
      };
      observers.push(observer);
      return observer.stop;
    },
  );
  const firestore = {
    collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
    collectionGroup: (_db: unknown, group: string) => ({ group }),
    documentId: () => '__name__',
    query: (base: CacheQuery['base'], ...constraints: CacheConstraint[]) => ({
      base,
      constraints,
    }),
    where: (field: string, op: string, value: unknown) => ({
      field,
      op,
      value,
    }),
    orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') => ({
      kind: 'orderBy' as const,
      field,
      direction,
    }),
    limit: (count: number) => ({ kind: 'limit' as const, count }),
    getDocsFromCache,
    onSnapshot,
    getDocs,
    getDocsFromServer,
    getDoc,
  };
  return {
    firestore,
    getDocsFromCache,
    onSnapshot,
    getDocs,
    getDocsFromServer,
    getDoc,
    callable,
    observe,
    observers,
    db: {} as Firestore,
    evaluate,
    seed(rows: CacheDocument[]) {
      documents = structuredClone(rows);
    },
    seedWorkspace(snapshot: WorkspaceSnapshot) {
      documents = structuredClone([
        ...snapshot.projects.map((p) => ({
          path: 'projects/' + p.id,
          data: p.data,
        })),
        ...snapshot.records,
      ]);
    },
    async emit(snapshot: WorkspaceSnapshot, index = 0) {
      this.seedWorkspace(snapshot);
      const observer = observers[index];
      if (observer.active) observer.next(snapshot);
      await flushCache();
    },
    deferRead() {
      let resolve!: (value: ReturnType<typeof evaluate>) => void;
      let reject!: (error: Error) => void;
      let captured!: ReturnType<typeof evaluate>;
      const promise = new Promise<ReturnType<typeof evaluate>>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      getDocsFromCache.mockImplementationOnce((target) => {
        captured = evaluate(target);
        return promise;
      });
      return { release: () => resolve(captured), reject };
    },
    reset() {
      documents = [];
      observers.splice(0);
      vi.clearAllMocks();
      getDocsFromCache
        .mockReset()
        .mockImplementation(async (target) => evaluate(target));
    },
  };
}
export const nativeCache = createNativeCacheFixture();
export const state = (
  patch: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot => ({
  projects: [],
  records: [],
  completedProjects: [],
  complete: true,
  syncing: false,
  error: '',
  ...patch,
});
export const project = (id = 'p', data: Record<string, unknown> = {}) => ({
  id,
  data: { type: 'work', topics: [], ...data },
});
export const row = (
  id = 'r',
  patch: Record<string, unknown> = {},
  uid = 'alice',
): CacheDocument => ({
  path: 'users/' + uid + '/records/' + id,
  data: {
    uid,
    projectId: 'p',
    startedAt: '2026-10-08T12:00:00Z',
    timeZone: 'UTC',
    topics: [],
    ...patch,
  },
});
/** Drain bounded promises, not timers; multi-batch catalogs finish asynchronously. */
export async function flushCache() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
