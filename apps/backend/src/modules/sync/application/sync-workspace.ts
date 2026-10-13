import { z } from 'zod';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { HttpsError } from 'firebase-functions/v2/https';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';

export interface SyncRow {
  path: string;
  data: Record<string, unknown>;
  /** Project catalogue only: canonical creation identity plus durable ACL epoch. */
  generation?: string;
}
export interface SyncEvent {
  revision: number;
  path: string;
  projectId: string | null;
  previousProjectId?: string;
  data: Record<string, unknown> | null;
}
export interface SyncStore {
  head: () => Promise<number>;
  projects: () => Promise<SyncRow[]>;
  events: (cursor: number, head: number) => Promise<SyncEvent[]>;
  bootstrap: (
    projectId: string,
    after: string | undefined,
    uid: string,
  ) => Promise<SyncRow[]>;
  currentRows: (paths: string[]) => Promise<SyncRow[]>;
}
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[^/]+$/);
const inputSchema = z
  .object({
    cursor: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    knownProjectIds: z.array(id).max(1000).optional(),
    bootstrap: z
      .object({
        projectId: id,
        after: z
          .string()
          .max(1024)
          .regex(/^users\/[^/]+\/records\/[^/]+$/)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Firebase callable encoding must not reinterpret Admin SDK Timestamp instances. */
export function normalizeSyncData(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if ('toDate' in value && typeof value.toDate === 'function')
    return (value as { toDate: () => Date }).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeSyncData);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeSyncData(item)]),
  );
}

export async function syncWorkspaceHandler(
  store: SyncStore,
  raw: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success)
    throw new HttpsError(
      'invalid-argument',
      'Parâmetros de sincronização inválidos.',
    );
  const input = parsed.data;
  // Capture first; later changes belong to a later delta, including writes during bootstrap.
  const head = await store.head();
  if (!Number.isSafeInteger(head) || head < 0)
    throw new HttpsError('internal', 'Revisão inválida.');
  if (input.cursor !== undefined && input.cursor > head)
    throw new HttpsError(
      'failed-precondition',
      'Cursor maior que a revisão atual; reinicie o cache.',
    );
  const catalog = await store.projects();
  if (catalog.length > 1000)
    throw new HttpsError(
      'resource-exhausted',
      'Catálogo excede orçamento; resultado não é parcial.',
    );
  const projects = catalog.filter((row) =>
    canAccessProject(row.data, auth!.uid),
  );
  const allowed = new Set(
    projects.map((row) => row.path.slice('projects/'.length)),
  );
  const response = {
    projects: projects.map((row) => ({
      id: row.path.slice('projects/'.length),
      data: normalizeSyncData(row.data),
      generation: row.generation ?? 'legacy',
    })),
    events: [] as Array<{ revision: number; path: string; data: unknown }>,
    cursor: input.cursor ?? head,
    hasMore: false,
    head,
  };
  if (input.bootstrap) {
    const { projectId, after } = input.bootstrap;
    if (!allowed.has(projectId))
      throw new HttpsError('permission-denied', 'Projeto não autorizado.');
    const rows = await store.bootstrap(projectId, after, auth!.uid);
    const records = rows.filter((row) =>
      /^users[/][^/]+[/]records[/][^/]+$/.test(row.path),
    );
    return {
      ...response,
      bootstrap: {
        projectId,
        rows: rows.map((row) => ({
          path: row.path,
          data: normalizeSyncData(row.data),
        })),
        after: records.length === 250 ? records.at(-1)!.path : null,
      },
    };
  }
  if (input.cursor === undefined) return response;
  const scanned = await store.events(input.cursor, head);
  if (
    scanned.length > 250 ||
    scanned.some(
      (event, index) =>
        event.revision !== input.cursor! + index + 1 || event.revision > head,
    )
  )
    throw new HttpsError(
      'failed-precondition',
      'Lacuna no journal; reinicie o cache.',
    );
  response.cursor = scanned.at(-1)?.revision ?? input.cursor;
  response.hasMore = scanned.length === 250;
  if (!response.hasMore && response.cursor !== head)
    throw new HttpsError(
      'failed-precondition',
      'Journal incompleto para a revisão capturada.',
    );
  const recordPath = /^users[/][^/]+[/]records[/][^/]+$/;
  const auditPath = /^users[/]([^/]+)[/]records[/][^/]+[/]audit[/][^/]+$/;
  const relevant = scanned.filter(
    (event) =>
      recordPath.test(event.path) ||
      auditPath.exec(event.path)?.[1] === auth!.uid,
  );
  const paths = [
    ...new Set(
      relevant.flatMap((event) =>
        auditPath.test(event.path)
          ? [event.path, event.path.split('/').slice(0, 4).join('/')]
          : [event.path],
      ),
    ),
  ];
  // Journal payloads are historical and private. Never transmit them, even for a
  // once-authorized project: canonical may have moved or advanced after the head.
  const current = new Map(
    (paths.length ? await store.currentRows(paths) : []).map((row) => [
      row.path,
      row.data,
    ]),
  );
  for (const event of relevant) {
    const data = current.get(event.path);
    const audit = auditPath.test(event.path);
    const parent = audit
      ? current.get(event.path.split('/').slice(0, 4).join('/'))
      : data;
    const authorized =
      parent &&
      (!audit || !isDeletedRecord(parent)) &&
      typeof parent.projectId === 'string' &&
      allowed.has(parent.projectId);
    if (authorized && data) {
      response.events.push({
        revision: event.revision,
        path: event.path,
        data: normalizeSyncData(data),
      });
    } else if (
      (event.projectId && allowed.has(event.projectId)) ||
      (event.previousProjectId && allowed.has(event.previousProjectId))
    ) {
      // Actual missing rows and moves out remove stale local data; no destination payload.
      response.events.push({
        revision: event.revision,
        path: event.path,
        data: null,
      });
    }
  }
  return response;
}
