import {
  collection,
  doc,
  documentId,
  getDocFromCache,
  getDocsFromCache,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import {
  createDeletionObserver,
  isDeletedRecord,
} from '../cache/record-deletion';
import {
  observeWorkspace,
  observeWorkspaceAudit,
} from '../sync/workspace-runtime';
import { traceFirestore } from '../sync/firestore-diagnostics';
import { isHidden, safeProject } from '../../shared/ui/privacy';
import type { Row } from '../../shared/data';

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const objects = (value: unknown) =>
  Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value : fallback;
const validId = (id: string) => Boolean(id) && !id.includes('/');
export const descriptionKey = (
  item: { id: string; uid?: string },
  viewer: string,
) => JSON.stringify([item.uid || viewer, item.id]);
export type DescriptionSource = {
  id: string;
  uid: string;
  projectId: string;
  interpretation?: unknown;
  originalText?: unknown;
};
export type DetailSelection = { id: string; uid?: string; projectId: string };
export type DetailState = {
  record: Record<string, unknown> | null;
  loading: boolean;
  error: string;
};
export type AuditState = { rows: Row[]; loading: boolean; error: string };
export type ReportCatalogOptions = {
  revealed: boolean;
  global?: boolean;
  projectId?: string;
  includeArchived: boolean;
};

/** Screen selection reads only native persistent cache. Global synchronization
 * owns cache population; authorization is the current session allowlist AND
 * the current parent document ACL, never a retained record/project snapshot. */
export class BrowserDetailRepository {
  constructor(
    readonly db: Firestore,
    readonly viewer: string,
    readonly authorizedIds: ReadonlySet<string>,
    private readonly observeDeletion?: (rows: Row[]) => void,
  ) {}

  private async readDocument(path: string) {
    traceFirestore('cache.read', {
      collection: path.split('/').at(-2) ?? '',
      operation: 'detail',
      source: 'persistent-local',
    });
    try {
      const result = await getDocFromCache(doc(this.db, path));
      traceFirestore('cache.result', {
        operation: 'detail',
        count: result.exists() ? 1 : 0,
        source: 'persistent-local',
      });
      return result.exists() ? result.data() : undefined;
    } catch (error) {
      // An uncached document has no local value. Never fall back to getDoc/server.
      if (object(error).code === 'unavailable') return undefined;
      throw error;
    }
  }
  async readProject(projectId: string) {
    if (
      !this.viewer ||
      !validId(projectId) ||
      !this.authorizedIds.has(projectId)
    )
      return undefined;
    const data = await this.readDocument('projects/' + projectId);
    return data && canAccessProject(data, this.viewer) ? data : undefined;
  }
  async readRecordDetail(
    ownerUid: string,
    recordId: string,
    expectedProjectId?: string,
  ) {
    if (!this.viewer || !validId(ownerUid) || !validId(recordId)) return null;
    const data = await this.readDocument(
      'users/' + ownerUid + '/records/' + recordId,
    );
    if (!data || data.uid !== ownerUid) return null;
    const projectId = text(data.projectId);
    if (expectedProjectId && expectedProjectId !== projectId) return null;
    const project = await this.readProject(projectId);
    if (!project || (project.type === 'personal' && ownerUid !== this.viewer))
      return null;
    if (ownerUid === this.viewer)
      this.observeDeletion?.([{ id: recordId, data }]);
    return isDeletedRecord(data) ? null : data;
  }
  async readDescriptions(items: readonly DetailSelection[]) {
    const result = new Map<string, DescriptionSource>();
    const selected = new Map(
      items.map((item) => [descriptionKey(item, this.viewer), item]),
    );
    // Bound cache-read concurrency for complete historical calendars; this is
    // request-local scheduling, not a retained snapshot/cache or remote listener.
    const entries = [...selected];
    for (let start = 0; start < entries.length; start += 32) {
      await Promise.all(
        entries.slice(start, start + 32).map(async ([key, item]) => {
          const uid = item.uid || this.viewer;
          const data = await this.readRecordDetail(
            uid,
            item.id,
            item.projectId,
          );
          if (data)
            result.set(key, {
              id: item.id,
              uid,
              projectId: item.projectId,
              interpretation: data.interpretation,
              originalText: data.originalText,
            });
        }),
      );
    }
    return result;
  }
  async readAudit(recordId: string, maxRows: number): Promise<Row[]> {
    if (!(await this.readRecordDetail(this.viewer, recordId))) return [];
    const count = Math.max(1, Math.floor(maxRows));
    const path = 'users/' + this.viewer + '/records/' + recordId + '/audit';
    traceFirestore('cache.read', {
      collection: 'audit',
      operation: 'detail.audit',
      source: 'persistent-local',
    });
    const result = await getDocsFromCache(
      query(collection(this.db, path), orderBy(documentId()), limit(count)),
    );
    traceFirestore('cache.result', {
      collection: 'audit',
      count: result.size,
      source: 'persistent-local',
    });
    // Audit deletion events are history: no tombstone predicate is applied.
    return result.docs.map((item) => ({ id: item.id, data: item.data() }));
  }
  async readReportCatalog(options: ReportCatalogOptions) {
    const rows: Row[] = [];
    const ids = [...this.authorizedIds];
    for (let start = 0; start < ids.length; start += 30) {
      const result = await getDocsFromCache(
        query(
          collection(this.db, 'projects'),
          where(documentId(), 'in', ids.slice(start, start + 30)),
        ),
      );
      for (const item of result.docs) {
        const data = item.data();
        if (
          this.authorizedIds.has(item.id) &&
          canAccessProject(data, this.viewer)
        )
          rows.push({ id: item.id, data });
      }
    }
    const byId = new Map(rows.map((row) => [row.id, row.data]));
    // Firebase cannot test absent confidentiality fields; the presentation
    // default is public. The supported ID allowlist is queried above.
    const available = options.global
      ? rows.filter(
          (row) =>
            row.data.type === 'work' && !isHidden(row.data, options.revealed),
        )
      : rows;
    const projectOptions = available.map((row) => {
      const display = safeProject(row.data, options.revealed);
      return {
        id: row.id,
        label: text(display.title, 'Projeto'),
        searchText: text(display.title) + ' ' + text(display.description),
      };
    });
    const selectedProject = options.projectId
      ? byId.get(options.projectId)
      : undefined;
    const selectionAvailable =
      !options.projectId ||
      Boolean(
        selectedProject &&
        (!options.global ||
          (selectedProject.type === 'work' &&
            !isHidden(selectedProject, options.revealed))),
      );
    const topics = selectCalendarTopics(
      selectedProject,
      options.revealed,
      options.includeArchived,
    );
    const validTopicIds = new Set(
      selectCalendarTopics(selectedProject, true, options.includeArchived).map(
        (topic) => topic.id,
      ),
    );
    return {
      projects: byId,
      projectOptions,
      topics,
      validTopicIds,
      selectedProject,
      selectionAvailable,
    };
  }
  async readProjectTopic(projectId: string, requested: string) {
    const project = await this.readProject(projectId);
    const catalog = objects(project?.topics);
    const canonical = canonicalCatalogTopic(catalog, requested);
    const topic = new Map(catalog.map((item) => [text(item.id), item])).get(
      canonical ?? '',
    );
    return { project, canonical, topic };
  }
}

/** Embedded topics are array objects, not a Firestore subcollection. Firestore
 * cannot query object properties/state or traverse mergedIntoTopicId aliases.
 * Their parent is queried by ID/ACL before this exact residual is evaluated. */
export function selectCalendarTopics(
  project: Record<string, unknown> | undefined,
  revealed: boolean,
  includeArchived: boolean,
) {
  if (!project || isHidden(project, revealed)) return [];
  return objects(project.topics)
    .filter(
      (topic) =>
        !topic.mergedIntoTopicId &&
        (includeArchived || !topic.archived) &&
        Boolean(text(topic.id)),
    )
    .map((topic) => ({
      id: text(topic.id),
      label: text(topic.title, 'Tópico'),
    }));
}
export function canonicalCatalogTopic(
  topics: Record<string, unknown>[],
  requested: string,
): string | null {
  const catalog = new Map(topics.map((topic) => [text(topic.id), topic]));
  if (catalog.size !== topics.length) return null;
  let id = requested;
  const seen = new Set<string>();
  for (let n = 0; n < 200; n++) {
    if (seen.has(id)) return null;
    seen.add(id);
    const topic = catalog.get(id);
    if (!topic) return null;
    if (!topic.mergedIntoTopicId) return id;
    if (typeof topic.mergedIntoTopicId !== 'string') return null;
    id = topic.mergedIntoTopicId;
  }
  return null;
}

/** Workspace notifications invalidate local reads, but do not select records.
 * No document listener or filter-dependent remote subscription is created. */
export function observeRecordDetail(
  db: Firestore,
  uid: string,
  recordId: string,
  next: (state: DetailState) => void,
) {
  let alive = true,
    generation = 0;
  const observeDeletion = createDeletionObserver(uid);
  const stop = observeWorkspace(db, uid, (snapshot) => {
    const current = ++generation;
    if (!snapshot.complete || snapshot.error) {
      next({ record: null, loading: !snapshot.error, error: snapshot.error });
      return;
    }
    // Fail closed while a newer ACL/deletion notification is being checked.
    next({ record: null, loading: true, error: '' });
    const repository = new BrowserDetailRepository(
      db,
      uid,
      new Set(snapshot.projects.map((project) => project.id)),
      observeDeletion,
    );
    void repository
      .readRecordDetail(uid, recordId)
      .then((record) => {
        if (alive && generation === current)
          next({ record, loading: false, error: '' });
      })
      .catch(() => {
        if (alive && generation === current)
          next({
            record: null,
            loading: false,
            error: 'Não foi possível consultar este registro privado.',
          });
      });
  });
  return () => {
    alive = false;
    generation++;
    stop();
  };
}
export function observeRecordAudit(
  db: Firestore,
  uid: string,
  recordId: string,
  maxRows: number,
  next: (state: AuditState) => void,
) {
  let alive = true,
    generation = 0;
  const parentPath = 'users/' + uid + '/records/' + recordId;
  const stop = observeWorkspaceAudit(db, uid, parentPath, (snapshot) => {
    const current = ++generation;
    next({ rows: [], loading: !snapshot.error, error: snapshot.error });
    if (!snapshot.complete || snapshot.error) return;
    const repository = new BrowserDetailRepository(
      db,
      uid,
      new Set(snapshot.projects.map((project) => project.id)),
    );
    void (async () => {
      const parent = await repository.readRecordDetail(uid, recordId);
      if (!parent) return { rows: [], loading: false, error: '' };
      if (!snapshot.auditReady?.includes(parentPath))
        return { rows: [], loading: true, error: '' };
      return {
        rows: await repository.readAudit(recordId, maxRows),
        loading: false,
        error: '',
      };
    })()
      .then((state) => {
        if (alive && generation === current) next(state);
      })
      .catch(() => {
        if (alive && generation === current)
          next({
            rows: [],
            loading: false,
            error: 'Não foi possível consultar o histórico deste registro.',
          });
      });
  });
  return () => {
    alive = false;
    generation++;
    stop();
  };
}
