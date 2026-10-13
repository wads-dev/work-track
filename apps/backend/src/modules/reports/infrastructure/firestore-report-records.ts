import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import type { Firestore } from 'firebase-admin/firestore';
import {
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import type {
  ReportRecord,
  ReportRecordsRepository,
} from '@work-track/core/reports/domain/report-record';
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
    const personal = effectiveProjectType(project.data()!) === 'personal';
    let query = this.db
      .collectionGroup('records')
      .where('projectId', '==', projectId);
    if (personal) query = query.where('uid', '==', viewerUid);
    // Missing/null deletedAt is active; Firestore equality/null drops missing legacy
    // documents. Bound the unavoidable tombstone residual and fail before truncating.
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
