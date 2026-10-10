import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  canReadDailyProject,
  DailyHoursError,
  validOwnUid,
  validTimeZone,
  type DailyProject,
  type DailyHoursRepository,
} from '@work-track/core/daily-hours/domain/daily-hours';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
const source = z
  .object({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso
      .datetime({ offset: true })
      .nullish()
      .transform((value) => value ?? undefined),
    timeZone: z.string().min(1).max(100).refine(validTimeZone),
  })
  .refine(
    (r) =>
      r.endedAt === undefined ||
      Date.parse(r.endedAt) >= Date.parse(r.startedAt),
  );
export class FirestoreDailyHoursRepository implements DailyHoursRepository {
  constructor(private readonly db: Firestore) {}
  async loadOwnHistory(uid: string, projectId?: string) {
    if (!validOwnUid(uid))
      throw new DailyHoursError('unauthenticated', 'Autenticação necessária.');
    if (projectId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(projectId))
      throw new DailyHoursError('not-found', 'Projeto não encontrado.');
    // Records and authorization metadata share one read-only consistent snapshot.
    return this.db.runTransaction(
      async (tx) => {
        const records: ReportSourceRecord[] = [],
          projects = new Map<string, DailyProject>();
        const loadProjects = async (ids: string[]) => {
          const missing = [...new Set(ids)].filter(
            (id) => !projects.has(id) && /^[A-Za-z0-9_-]{1,128}$/.test(id),
          );
          for (let i = 0; i < missing.length; i += 100) {
            const docs = await tx.getAll(
              ...missing
                .slice(i, i + 100)
                .map((id) => this.db.collection('projects').doc(id)),
            );
            for (const doc of docs)
              if (doc.exists) projects.set(doc.id, doc.data() as DailyProject);
          }
        };
        if (projectId) {
          await loadProjects([projectId]);
          if (!canReadDailyProject(projects.get(projectId), uid))
            throw new DailyHoursError('not-found', 'Projeto não encontrado.');
        }
        let cursor: string | undefined,
          scanned = 0;
        for (;;) {
          let query = this.db
            .collection('users')
            .doc(uid)
            .collection('records')
            .orderBy(FieldPath.documentId());
          if (cursor) query = query.startAfter(cursor);
          const page = await tx.get(query.limit(500));
          scanned += page.docs.length;
          if (scanned > 2000)
            throw new DailyHoursError(
              'resource-exhausted',
              'Histórico próprio excede o limite operacional de 2000 registros. Nenhum total parcial foi retornado; contate suporte sem apagar histórico.',
            );
          await loadProjects(
            page.docs.flatMap((doc) =>
              typeof doc.data().projectId === 'string'
                ? [doc.data().projectId as string]
                : [],
            ),
          );
          for (const doc of page.docs) {
            const raw: unknown = doc.data();
            if (isDeletedRecord(raw)) continue;
            if (
              !raw ||
              typeof raw !== 'object' ||
              !('projectId' in raw) ||
              typeof raw.projectId !== 'string' ||
              !canReadDailyProject(projects.get(raw.projectId), uid)
            )
              continue;
            const parsed = source.safeParse(raw);
            if (!parsed.success)
              throw new DailyHoursError(
                'resource-exhausted',
                'Histórico próprio autorizado contém registro inválido; nenhum total parcial foi retornado.',
              );
            records.push({ ...parsed.data, id: doc.id, uid, topics: [] });
          }
          if (page.docs.length < 500) break;
          cursor = page.docs.at(-1)!.id;
        }
        return { records, projects };
      },
      { readOnly: true },
    );
  }
}
