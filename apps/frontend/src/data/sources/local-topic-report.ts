import type { TopicReportRepository } from '@work-track/core/reports/application/get-topic-report';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { FirestoreReportRepository } from '../repositories/firestore-report-repository';
/** Thin port adapter; all selection stays in the native Firestore repository. */
export class LocalTopicReportRepository implements TopicReportRepository {
  private readonly projectRepository;
  constructor(private readonly source: FirestoreReportRepository) {
    this.projectRepository = source.project();
  }
  readPage(
    projectId: string,
    limit: number,
    cursor?: string,
    viewerUid?: string,
    selection?: import('@work-track/core/reports/domain/personal-report').ReportRecordSelection,
  ) {
    return this.projectRepository.readPage(
      projectId,
      limit,
      cursor,
      viewerUid,
      selection,
    );
  }
  loadContext(uids: string[], owner?: string) {
    return this.projectRepository.loadContext(uids, owner);
  }
  userLabels(uids: string[]) {
    return this.source.userLabels(uids);
  }
  revalidate(rows: ReportSourceRecord[], viewer: string, personal: boolean) {
    return this.source.revalidate(rows, viewer, personal, false);
  }
}
