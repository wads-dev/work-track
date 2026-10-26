import {
  resolveTimeMultiplier,
  timeMultipliersSchema,
} from '@work-track/core/registration/domain/time-multipliers';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import {
  FieldPath,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  canReadDailyProject,
  DailyHoursError,
  validOwnUid,
  validTimeZone,
  type DailyProject,
  type DailyHoursRepository,
  type DailyHoursSelection,
} from '@work-track/core/daily-hours/domain/daily-hours';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
const source = z
  .object({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    deletedAt: z.null(),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso
      .datetime({ offset: true })
      .nullable()
      .transform((value) => value ?? undefined),
    timeZone: z.string().min(1).max(100).refine(validTimeZone),
  })
  .refine(
    (r) =>
      r.endedAt === undefined ||
      Date.parse(r.endedAt) >= Date.parse(r.startedAt),
  );
const pageSize = 500,
  physicalLimit = 10000,
  visibleLimit = 2000;
function guardPhysical(scanned: number) {
  if (scanned > physicalLimit)
    throw new DailyHoursError(
      'resource-exhausted',
      'Histórico próprio excede o limite operacional de 10000 registros físicos. Nenhum total parcial foi retornado; contate suporte sem apagar histórico.',
    );
}
function guardVisible(count: number) {
  if (count > visibleLimit)
    throw new DailyHoursError(
      'resource-exhausted',
      'Histórico próprio autorizado excede o limite operacional de 2000 registros. Nenhum total parcial foi retornado; contate suporte sem apagar histórico.',
    );
}
export class FirestoreDailyHoursRepository implements DailyHoursRepository {
  constructor(private readonly db: Firestore) {}
  async loadOwnHistory(
    uid: string,
    projectId?: string,
    selection?: DailyHoursSelection,
  ) {
    if (!validOwnUid(uid))
      throw new DailyHoursError('unauthenticated', 'Autenticação necessária.');
    if (projectId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(projectId))
      throw new DailyHoursError('not-found', 'Projeto não encontrado.');
    if (
      selection &&
      (!Number.isFinite(selection.startedAt) ||
        !Number.isFinite(selection.endedAt) ||
        !Number.isFinite(new Date(selection.startedAt).getTime()) ||
        !Number.isFinite(new Date(selection.endedAt).getTime()) ||
        selection.endedAt <= selection.startedAt ||
        typeof selection.includeArchived !== 'boolean')
    )
      throw new DailyHoursError('invalid-argument', 'Seleção diária inválida.');
    // Global context, selection and authorization metadata share one read-only snapshot.
    return this.db.runTransaction(
      async (tx) => {
        const records: ReportSourceRecord[] = [],
          projects = new Map<string, DailyProject>(),
          loadedProjects = new Set<string>();
        const loadProjects = async (ids: string[]) => {
          const missing = [...new Set(ids)].filter(
            (id) =>
              !loadedProjects.has(id) && /^[A-Za-z0-9_-]{1,128}$/.test(id),
          );
          for (let i = 0; i < missing.length; i += 100) {
            const batch = missing.slice(i, i + 100);
            const docs = await tx.getAll(
              ...batch.map((id) => this.db.collection('projects').doc(id)),
            );
            for (const id of batch) loadedProjects.add(id);
            for (const doc of docs)
              if (doc.exists) {
                const data = doc.data()!;
                if (
                  canReadDailyProject(data, uid) &&
                  (typeof data.archived !== 'boolean' ||
                    typeof data.confidential !== 'boolean')
                )
                  throw new DailyHoursError(
                    'resource-exhausted',
                    'Projeto autorizado contém flags inválidas; nenhum total parcial foi retornado.',
                  );
                if (
                  canReadDailyProject(data, uid) &&
                  data.timeMultipliers !== undefined
                ) {
                  const config = timeMultipliersSchema.safeParse(
                    data.timeMultipliers,
                  );
                  if (!config.success)
                    throw new DailyHoursError(
                      'resource-exhausted',
                      'Projeto autorizado contém multiplicadores inválidos; nenhum total parcial foi retornado.',
                    );
                }
                projects.set(doc.id, data);
              }
          }
        };
        if (projectId) {
          await loadProjects([projectId]);
          if (!canReadDailyProject(projects.get(projectId), uid))
            throw new DailyHoursError('not-found', 'Projeto não encontrado.');
        }
        const ownRecords = this.db
          .collection('users')
          .doc(uid)
          .collection('records')
          .where('deletedAt', '==', null);
        // Never constrain global context by project, archive state or display dates.
        // Canonical active records have explicit deletedAt null; select them natively.
        let cursor: QueryDocumentSnapshot | undefined,
          scanned = 0;
        for (;;) {
          let query = ownRecords.orderBy(FieldPath.documentId());
          if (cursor) query = query.startAfter(cursor);
          const page = await tx.get(query.limit(pageSize));
          scanned += page.docs.length;
          guardPhysical(scanned);
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
            const project = projects.get(raw.projectId);
            const multipliers = timeMultipliersSchema.parse(
              project?.timeMultipliers ?? {},
            );
            records.push({
              ...parsed.data,
              id: doc.id,
              uid,
              topics: [],
              timeMultiplier: resolveTimeMultiplier(
                multipliers[uid],
                parsed.data.startedAt,
              ),
            });
            guardVisible(records.length);
          }
          if (page.docs.length < pageSize) break;
          cursor = page.docs.at(-1)!;
        }
        // No selection requested: this is already the complete native owner query.
        if (!selection && !projectId)
          return { records, selectedRecords: records, projects };
        let selectedQuery: Query = ownRecords;
        if (projectId)
          selectedQuery = selectedQuery.where('projectId', '==', projectId);
        if (selection) {
          // Offset ISO strings are not ordered by instant. A two-day date-prefix
          // envelope is conservative even for noncanonical offsets and DST days.
          const upperDate = new Date(selection.endedAt + 2 * 86400000);
          const upperPrefix =
            upperDate.getUTCFullYear() > 9999
              ? '9999-12-31\uffff'
              : upperDate.toISOString().slice(0, 10);
          selectedQuery = selectedQuery
            .where('startedAt', '<', upperPrefix)
            .orderBy('startedAt');
        }
        selectedQuery = selectedQuery.orderBy(FieldPath.documentId());
        const authorized = new Map(records.map((r) => [r.id, r])),
          selectedRecords: ReportSourceRecord[] = [];
        cursor = undefined;
        scanned = 0;
        for (;;) {
          const query: Query = cursor
            ? selectedQuery.startAfter(cursor)
            : selectedQuery;
          const page = await tx.get(query.limit(pageSize));
          scanned += page.docs.length;
          guardPhysical(scanned);
          for (const doc of page.docs) {
            // Reuse the schema/ACL-validated source from the same snapshot, not a
            // second whole-history read or parsing of untrusted payload identity.
            const record = authorized.get(doc.id);
            if (!record) continue;
            const project = projects.get(record.projectId)!;
            // Firestore cannot join the project's archive/merge flags to records.
            if (
              selection &&
              !selection.includeArchived &&
              (project.archived || project.mergedInto)
            )
              continue;
            // Exact epoch overlap is unsupported over persisted offset strings;
            // Lower lexical end ranges would omit valid offset instants.
            // Native owner/project/start-upper constraints precede this residual;
            // no lower start bound: spanning closed facts and old opens must survive.
            if (
              selection &&
              (Date.parse(record.startedAt) >= selection.endedAt ||
                (record.endedAt !== undefined &&
                  Date.parse(record.endedAt) <= selection.startedAt))
            )
              continue;
            selectedRecords.push(record);
            guardVisible(selectedRecords.length);
          }
          if (page.docs.length < pageSize) break;
          cursor = page.docs.at(-1)!;
        }
        return { records, selectedRecords, projects };
      },
      { readOnly: true },
    );
  }
}
