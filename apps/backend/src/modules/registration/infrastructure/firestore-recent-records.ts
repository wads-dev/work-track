import { FieldPath, type Query } from 'firebase-admin/firestore';
import { ProjectManagementError } from '@work-track/core/registration/domain/project-management';
import { reportUpperDatePrefix } from '../../reports/infrastructure/admin-report-query.js';

const physicalRecordBudget = 2000;

/** Candidate predicates for validated, four-digit ISO write facts. Two padded
 * days cover accepted offsets and date-prefix truncation; exact instant checks
 * remain a repository residual. Open and active storage fields are explicit nulls.
 */
export function recentRecordQueries(
  records: Query,
  uid: string,
  hours: number,
  now: Date,
) {
  const upper = reportUpperDatePrefix({ to: now.toISOString() })!;
  const paddedLower = new Date(
    now.getTime() - hours * 3600000 - 2 * 86400000,
  ).toISOString();
  const lower = paddedLower.startsWith('-') ? '' : paddedLower.slice(0, 10);
  const own = records
    .where('uid', '==', uid)
    .where('deletedAt', '==', null)
    .where('startedAt', '<', upper);
  return [
    {
      query: own
        .where('startedAt', '>=', lower)
        .orderBy('startedAt')
        .orderBy(FieldPath.documentId()),
    },
    {
      query: own
        .where('endedAt', '>=', lower)
        .orderBy('endedAt')
        .orderBy('startedAt')
        .orderBy(FieldPath.documentId()),
    },
    {
      query: own
        .where('endedAt', '==', null)
        .where('startedAt', '<', lower)
        .orderBy('startedAt')
        .orderBy(FieldPath.documentId()),
    },
  ];
}

/** Complete all branches within one physical-read budget, including duplicate
 * reads. A one-document overflow probe throws;
 * no branch is silently truncated. The API cursor is a visible chronological ID,
 * not any of these physical query orders/cursors.
 */
export async function readRecentRecordCandidates(
  records: Query,
  uid: string,
  hours: number,
  now: Date,
) {
  const candidates = new Map<
    string,
    Record<string, unknown> & { id: string }
  >();
  let physicalReads = 0;
  for (const { query } of recentRecordQueries(records, uid, hours, now)) {
    const snapshot = await query
      .limit(physicalRecordBudget - physicalReads + 1)
      .get();
    physicalReads += snapshot.docs.length;
    if (physicalReads > physicalRecordBudget)
      throw new ProjectManagementError(
        'resource-exhausted',
        'Histórico excede orçamento de leitura; não é possível afirmar ausência de tracking.',
      );
    for (const doc of snapshot.docs) {
      const data = doc.data();

      // One canonical own collection; ID is the physical document identity.
      candidates.set(doc.id, { ...data, id: doc.id });
    }
  }
  return [...candidates.values()];
}
