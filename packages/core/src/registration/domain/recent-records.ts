import { z } from 'zod';
import type { Project } from './work-model.js';
import { canAccessProject } from './project-access.js';
import { isDeletedRecord } from './record-lifecycle.js';
export const recentRecordsInput = z
  .object({
    hours: z.number().int().min(1).max(720).default(24),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().max(128).optional(),
  })
  .strict();
export type RecentRecordsInput = z.infer<typeof recentRecordsInput>;
export interface RecentRecordsRepository {
  listRecentRecords(input: RecentRecordsInput, uid: string): Promise<unknown>;
}
const documentIdEncoder = new TextEncoder();
function compareRecentDocumentIds(firstId: string, secondId: string) {
  // Firestore document IDs use UTF-8 byte order, including ASCII case and
  // non-BMP legacy IDs; locale or UTF-16 string ordering is not equivalent.
  const first = documentIdEncoder.encode(firstId);
  const second = documentIdEncoder.encode(secondId);
  for (let index = 0; index < Math.min(first.length, second.length); index++) {
    const order = first[index]! - second[index]!;
    if (order) return order;
  }
  return first.length - second.length;
}
export function compactRecentRecords(
  records: Array<Record<string, unknown> & { id: string }>,
  projects: Project[],
  uid: string,
  input: RecentRecordsInput,
  now = new Date(),
) {
  const catalog = new Map(
    projects.filter((p) => canAccessProject(p, uid)).map((p) => [p.id, p]),
  );
  const since = now.getTime() - input.hours * 3600000;
  const visible = records
    .filter(
      (r) =>
        r.uid === uid &&
        !isDeletedRecord(r) &&
        catalog.has(String(r.projectId)) &&
        typeof r.startedAt === 'string' &&
        Number.isFinite(Date.parse(r.startedAt)) &&
        Date.parse(r.startedAt) <= now.getTime() &&
        (r.endedAt === null ||
          r.endedAt === undefined ||
          Date.parse(r.startedAt) >= since ||
          (typeof r.endedAt === 'string' && Date.parse(r.endedAt) >= since)),
    )
    .sort(
      (a, b) =>
        Date.parse(String(b.startedAt)) - Date.parse(String(a.startedAt)) ||
        compareRecentDocumentIds(a.id, b.id),
    );
  const offset = input.cursor
    ? visible.findIndex((r) => r.id === input.cursor) + 1
    : 0;
  if (input.cursor && !offset) throw new Error('Cursor inválido.');
  const page = visible.slice(offset, offset + input.limit);
  return {
    queriedAt: now.toISOString(),
    hours: input.hours,
    records: page.map((r) => {
      const project = catalog.get(String(r.projectId))!;
      const allocations = Array.isArray(r.topics)
        ? (r.topics as Array<{ topicId: string }>)
        : [];
      return {
        id: r.id,
        project: { id: project.id, title: project.title },
        topics: allocations.map((a) => ({
          id: a.topicId,
          title:
            project.topics.find((t) => t.id === a.topicId)?.title ?? a.topicId,
        })),
        title: Array.from(
          (typeof r.title === 'string'
            ? r.title
            : typeof r.interpretation === 'string'
              ? r.interpretation
              : typeof r.originalText === 'string'
                ? r.originalText
                : ''
          )
            .replace(/\s+/g, ' ')
            .trim(),
        )
          .slice(0, 70)
          .join(''),
        startedAt: r.startedAt,
        endedAt: r.endedAt ?? null,
      };
    }),
    hasMore: offset + page.length < visible.length,
    nextCursor: offset + page.length < visible.length ? page.at(-1)!.id : null,
  };
}
