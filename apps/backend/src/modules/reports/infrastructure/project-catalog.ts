import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  canAccessProject,
  effectiveProjectType,
} from '../../registration/domain/project-access.js';
import type { ReportSourceRecord } from '../domain/project-report.js';
export const reportTopicsSchema = z
  .array(
    z.object({
      topicId: z.string(),
      percentage: z.number().finite().nonnegative().optional(),
      durationMinutes: z.number().finite().nonnegative().optional(),
    }),
  )
  .default([]);
const topic = z.object({
  id: z.string(),
  title: z.string(),
  mergedIntoTopicId: z.string().optional(),
});
export interface ReportProjectMetadata {
  type?: string;
  createdBy?: string;
  archived?: boolean;
  mergedInto?: string;
  topics: { id: string; title: string; mergedIntoTopicId?: string }[];
}
export async function readProjectCatalog(
  db: Firestore,
  ids: string[],
): Promise<Map<string, ReportProjectMetadata>> {
  const catalog = new Map<string, ReportProjectMetadata>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const docs = await db.getAll(
      ...unique
        .slice(i, i + 100)
        .map((id) => db.collection('projects').doc(id)),
    );
    for (const doc of docs) {
      if (!doc.exists) continue;
      const data = doc.data()!;
      const topics = z.array(topic).safeParse(data.topics ?? []);
      // Invalid access metadata must fail closed, not become legacy shared.
      catalog.set(doc.id, {
        type:
          typeof data.type === 'string'
            ? data.type
            : data.type === undefined
              ? undefined
              : '__invalid__',
        createdBy:
          typeof data.createdBy === 'string' ? data.createdBy : undefined,
        archived: Boolean(data.archived),
        mergedInto:
          typeof data.mergedInto === 'string' ? data.mergedInto : undefined,
        topics: topics.success ? topics.data : [],
      });
    }
  }
  return catalog;
}
export function selectReportRecords(
  records: ReportSourceRecord[],
  catalog: Map<string, ReportProjectMetadata>,
  scope: { viewerUid: string } | { companyOnly: true },
): ReportSourceRecord[] {
  return records.filter((record) => {
    const project = catalog.get(record.projectId);
    return (
      project !== undefined &&
      ('companyOnly' in scope
        ? effectiveProjectType(project) === 'work'
        : canAccessProject(project, scope.viewerUid))
    );
  });
}
