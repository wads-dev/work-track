import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { reportRecordSchema } from '@work-track/data/codecs/report-record';
import { readProjectCatalog, selectReportRecords } from './project-catalog.js';
import { ReportContextError } from '@work-track/core/reports/domain/global-estimates';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
const schema = reportRecordSchema('admin-owned');
export async function loadGlobalContext(
  db: Firestore,
  uids: string[],
  scope?: { viewerUid: string } | { companyOnly: true },
): Promise<ReportSourceRecord[]> {
  const records: ReportSourceRecord[] = [];
  // Sequential UIDs bound concurrency; read-only transaction yields one consistent
  // snapshot across internal pages, including facts starting before any report day.
  await db.runTransaction(
    async (tx) => {
      const loaded: ReportSourceRecord[] = [];
      for (const uid of uids) {
        let cursor: string | undefined,
          count = 0;
        for (;;) {
          let q = db
            .collection('users')
            .doc(uid)
            .collection('records')
            .orderBy(FieldPath.documentId());
          if (cursor) q = q.startAfter(cursor);
          const page = await tx.get(q.limit(501));
          const catalog = scope
            ? await readProjectCatalog(
                db,
                page.docs.flatMap((doc) =>
                  typeof doc.data().projectId === 'string'
                    ? [doc.data().projectId as string]
                    : [],
                ),
              )
            : undefined;
          const visible =
            catalog && scope
              ? page.docs.filter(
                  (doc) =>
                    selectReportRecords(
                      [
                        {
                          ...doc.data(),
                          id: doc.id,
                          uid,
                        } as ReportSourceRecord,
                      ],
                      catalog,
                      scope,
                    ).length > 0,
                )
              : page.docs.filter((doc) => !isDeletedRecord(doc.data()));
          if (count + visible.length > 2000)
            throw new ReportContextError(
              'Limite operacional de contexto global excedido (2000 registros por pessoa); contate suporte para otimização da consulta, sem apagar histórico.',
            );
          for (const doc of visible) {
            const parsed = schema.safeParse(doc.data());
            if (!parsed.success)
              throw new ReportContextError(
                'Contexto global contém registro inválido.',
              );
            loaded.push({ ...parsed.data, id: doc.id, uid });
          }
          count += visible.length;
          if (page.docs.length < 501) break;
          cursor = page.docs.at(-1)?.id;
        }
      }
      records.splice(0, records.length, ...loaded);
    },
    { readOnly: true },
  );
  return records;
}
