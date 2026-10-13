import type { TopicReportRepository } from '@work-track/core/reports/application/get-topic-report';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import {
  AuthorizedReportRepository,
  recordKey,
} from '@work-track/data/repositories/snapshots/authorized-report-repository';
import { traceFirestore } from '../sync/firestore-diagnostics';

/** One immutable, complete authorized snapshot for all pages and global context.
 * Labels are stable UID fallbacks; the UI people provider resolves identities.
 */
export class LocalTopicReportRepository implements TopicReportRepository {
  private readonly source: AuthorizedReportRepository;
  private readonly projectRepository;

  constructor(
    snapshot: Pick<
      AuthorizedReportRepository,
      'viewer' | 'records' | 'projects'
    >,
  ) {
    const projects = new Map(
      [...snapshot.projects].filter(([, project]) =>
        canAccessProject(project, snapshot.viewer),
      ),
    );
    const records = snapshot.records.filter((record) => {
      const project = projects.get(record.projectId);
      return (
        project &&
        !isDeletedRecord(record) &&
        (project.type !== 'personal' || record.uid === snapshot.viewer)
      );
    });
    traceFirestore('local.report.read', {
      source: 'topic',
      collections: 'projects,records',
      count: records.length,
      projects: projects.size,
    });
    // Deliberately ignore selectedKeys: topic history and estimates require global context.
    this.source = new AuthorizedReportRepository(
      snapshot.viewer,
      records,
      projects,
    );
    this.projectRepository = this.source.project();
  }

  readPage(
    projectId: string,
    limit: number,
    cursor?: string,
    viewerUid?: string,
  ) {
    return this.projectRepository.readPage(projectId, limit, cursor, viewerUid);
  }

  async loadContext(uids: string[], personalOwnerUid?: string) {
    if (personalOwnerUid && personalOwnerUid !== this.source.viewer)
      throw new Error('Visualizador incompatível.');
    return this.projectRepository.loadContext(uids, personalOwnerUid);
  }

  userLabels(uids: string[]) {
    return this.source.userLabels(uids);
  }

  async revalidate(
    records: ReportSourceRecord[],
    viewerUid: string,
    personal: boolean,
  ) {
    if (viewerUid !== this.source.viewer)
      throw new Error('Visualizador incompatível.');
    const current = new Map(
      (personal
        ? this.source.records.filter((record) => record.uid === viewerUid)
        : this.source.workRecords()
      ).map((record) => [recordKey(record), record]),
    );
    return records.filter((record) => {
      const value = current.get(recordKey(record));
      return value && JSON.stringify(value) === JSON.stringify(record);
    });
  }
}
