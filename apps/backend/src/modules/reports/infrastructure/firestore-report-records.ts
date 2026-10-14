import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { z } from 'zod';
import { decodeReportProjectMetadata } from '@work-track/data/codecs/report-project-metadata';
import type { Firestore } from 'firebase-admin/firestore';
import {
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import type {
  ReportRecord,
  ReportRecordsRepository,
} from '@work-track/core/reports/domain/report-record';
const recordDates = z
  .object({
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }).nullable(),
    deletedAt: z.null(),
  })
  .refine(
    (r) =>
      r.endedAt === null || Date.parse(r.endedAt) >= Date.parse(r.startedAt),
  );
export class FirestoreReportRecordsRepository implements ReportRecordsRepository {
  constructor(private readonly db: Firestore) {}
  async listByProject(
    projectId: string,
    limit: number,
    viewerUid?: string,
  ): Promise<ReportRecord[]> {
    if (!viewerUid) throw new Error('Projeto não encontrado.');
    const project = await this.db.collection('projects').doc(projectId).get();
    if (!project.exists || !canAccessProject(project.data(), viewerUid))
      throw new Error('Projeto não encontrado.');
    const metadata = decodeReportProjectMetadata(project.data()!, 'admin');
    const personal = effectiveProjectType(metadata) === 'personal';
    let query = this.db
      .collectionGroup('records')
      .where('projectId', '==', projectId)
      .where('deletedAt', '==', null);
    if (personal) query = query.where('uid', '==', viewerUid);
    // Bound the canonical active query and fail before truncating.
    const snapshot = await query.limit(2001).get();
    if (snapshot.docs.length > 2000)
      throw new Error(
        'Seleção excede 2000 registros físicos; nenhum resultado parcial.',
      );
    return snapshot.docs
      .filter((doc) => !isDeletedRecord(doc.data()))
      .filter((doc) => !personal || doc.data().uid === viewerUid)
      .slice(0, limit)
      .map((doc) => {
        const data = doc.data();
        const parts = doc.ref.path.split('/');
        if (
          parts.length !== 4 ||
          parts[0] !== 'users' ||
          parts[2] !== 'records' ||
          parts[1] !== data.uid ||
          data.projectId !== projectId
        )
          throw new Error('Invalid canonical record ownership');
        recordDates.parse(data);
        return {
          id: doc.id,
          projectId: data.projectId as string,
          uid: data.uid as string,
          startedAt: data.startedAt as string,
          ...(typeof data.endedAt === 'string'
            ? { endedAt: data.endedAt }
            : {}),
        };
      });
  }
}
