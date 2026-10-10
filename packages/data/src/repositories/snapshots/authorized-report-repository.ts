import type { CompanyReportRepository } from '@work-track/core/reports/domain/company-report';
import type { CalendarRepository } from '@work-track/core/reports/application/get-calendar-report';
import type {
  ProjectReportRepository,
  ReportSourceRecord,
} from '@work-track/core/reports/domain/project-report';
import { ReportContextError } from '@work-track/core/reports/domain/global-estimates';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import type { ReportProjectMetadata } from '../../codecs/report-project-metadata.js';
import { ClientPersonalReportRepository } from './personal-report-repository.js';
export const recordKey = (r: ReportSourceRecord) =>
  'users/' + r.uid + '/records/' + r.id;
export class AuthorizedReportRepository implements CompanyReportRepository {
  constructor(
    readonly viewer: string,
    readonly records: ReportSourceRecord[],
    readonly projects: ReadonlyMap<string, ReportProjectMetadata>,
    readonly selectedKeys?: ReadonlySet<string>,
  ) {}
  workRecords() {
    return this.records.filter((r) => {
      const p = this.projects.get(r.projectId);
      return (
        p && (p.type === undefined || p.type === 'work') && !isDeletedRecord(r)
      );
    });
  }
  async loadContext(uids: string[]) {
    const rows = this.workRecords().filter((r) => uids.includes(r.uid));
    for (const uid of uids)
      if (rows.filter((r) => r.uid === uid).length > 2000)
        throw new ReportContextError(
          'Limite operacional de contexto global excedido (2000 registros por pessoa).',
        );
    return rows;
  }
  async readPage(limit: number, cursor?: string, projectId?: string) {
    const rows = this.workRecords()
      .filter(
        (r) =>
          (!projectId || r.projectId === projectId) &&
          (!this.selectedKeys || this.selectedKeys.has(recordKey(r))) &&
          (!cursor || recordKey(r) > cursor),
      )
      .sort((a, b) => (recordKey(a) < recordKey(b) ? -1 : 1));
    const records = rows.slice(0, limit);
    return {
      records,
      scannedCount: records.length,
      nextCursor: rows.length > limit ? recordKey(records.at(-1)!) : null,
    };
  }
  async archivedProjectIds(ids: string[]) {
    return ids.filter((id) => {
      const p = this.projects.get(id);
      return !p || p.archived || p.mergedInto;
    });
  }
  async readTopics(ids: string[]) {
    return Object.fromEntries(
      ids.map((id) => [id, this.projects.get(id)?.topics ?? []]),
    );
  }
  async userLabels(uids: string[]) {
    return Object.fromEntries(
      uids.map((uid) => [uid, uid === this.viewer ? 'Você' : uid]),
    );
  }
  calendar(): CalendarRepository {
    const own = new ClientPersonalReportRepository(
      this.viewer,
      this.records,
      this.projects,
      this.selectedKeys &&
        new Set(
          this.records
            .filter(
              (r) =>
                r.uid === this.viewer && this.selectedKeys!.has(recordKey(r)),
            )
            .map((r) => r.id),
        ),
    );
    return {
      own,
      company: this,
      revalidate: async (rows, viewer, mode) => {
        if (viewer !== this.viewer)
          throw new Error('Visualizador incompatível.');
        const keys = new Set(
          (mode === 'global'
            ? this.workRecords()
            : await own.loadContext([viewer])
          ).map(recordKey),
        );
        return rows.filter((r) => keys.has(recordKey(r)));
      },
    };
  }
  project(): ProjectReportRepository {
    return {
      loadContext: (uids, owner) =>
        owner
          ? new ClientPersonalReportRepository(
              this.viewer,
              this.records,
              this.projects,
            ).loadContext([owner])
          : this.loadContext(uids),
      userLabels: (uids) => this.userLabels(uids),
      readPage: async (id, limit, cursor, viewer) => {
        const p = this.projects.get(id);
        if (
          viewer !== this.viewer ||
          !p ||
          (p.type === 'personal' && p.createdBy !== viewer)
        )
          return null;
        const rows = (
            p.type === 'personal'
              ? this.records.filter(
                  (r) => r.uid === viewer && !isDeletedRecord(r),
                )
              : this.workRecords()
          )
            .filter(
              (r) => r.projectId === id && (!cursor || recordKey(r) > cursor),
            )
            .sort((a, b) => (recordKey(a) < recordKey(b) ? -1 : 1)),
          records = rows.slice(0, limit);
        return {
          records,
          personal: p.type === 'personal',
          archived: Boolean(p.archived || p.mergedInto),
          topics: p.topics,
          topicLabels: Object.fromEntries(p.topics.map((t) => [t.id, t.title])),
          nextCursor: rows.length > limit ? recordKey(records.at(-1)!) : null,
        };
      },
    };
  }
}
