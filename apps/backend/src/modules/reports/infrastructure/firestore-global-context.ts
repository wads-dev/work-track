import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ReportContextError } from '../domain/global-estimates.js';
import type { ReportSourceRecord } from '../domain/project-report.js';
const schema = z.object({
  projectId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  timeZone: z.string(),
});
export async function loadGlobalContext(
  db: Firestore,
  uids: string[],
): Promise<ReportSourceRecord[]> {
  if (uids.length > 10)
    throw new ReportContextError(
      'Mais de10 pessoas nesta página; reduza o limite de registros.',
    );
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
          if (count + page.docs.length > 2000)
            throw new ReportContextError(
              'Limite operacional de contexto global excedido (2000 registros por pessoa); contate suporte para otimização da consulta, sem apagar histórico.',
            );
          for (const doc of page.docs) {
            const parsed = schema.safeParse(doc.data());
            if (!parsed.success)
              throw new ReportContextError(
                'Contexto global contém registro inválido.',
              );
            loaded.push({ ...parsed.data, id: doc.id, uid, topics: [] });
          }
          count += page.docs.length;
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
