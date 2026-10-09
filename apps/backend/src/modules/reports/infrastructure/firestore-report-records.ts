import type { Firestore } from 'firebase-admin/firestore';
import {
  canAccessProject,
  effectiveProjectType,
} from '../../registration/domain/project-access.js';
import type {
  ReportRecord,
  ReportRecordsRepository,
} from '../domain/report-record.js';
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
    const snapshot = await this.db
      .collectionGroup('records')
      .where('projectId', '==', projectId)
      .limit(limit)
      .get();
    return snapshot.docs
      .filter((doc) => !personal || doc.data().uid === viewerUid)
      .map((doc) => {
        const data = doc.data();
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
