import type { PersonalReportRepository } from '@work-track/core/reports/domain/personal-report';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { ReportContextError } from '@work-track/core/reports/domain/global-estimates';

import type { ReportProjectMetadata } from '../../codecs/report-project-metadata.js';

/** Compatibility name for callers of the immutable personal snapshot. */
export type ClientReportProject = ReportProjectMetadata;
/** An immutable snapshot is used for an entire calculation; no mixed revisions. */
export class ClientPersonalReportRepository implements PersonalReportRepository {
  constructor(
    private readonly uid: string,
    private readonly records: ReportSourceRecord[],
    private readonly projects: ReadonlyMap<string, ReportProjectMetadata>,
    private readonly selectedIds?: ReadonlySet<string>,
  ) {}
  private assertOwner(uids: string[]) {
    if (uids.length !== 1 || uids[0] !== this.uid)
      throw new Error('Personal report requires the authenticated owner.');
  }
  async loadContext(uids: string[]) {
    this.assertOwner(uids);
    const visible = this.records.filter(
      (r) =>
        r.uid === this.uid &&
        !isDeletedRecord(r) &&
        canAccessProject(this.projects.get(r.projectId), this.uid),
    );
    if (visible.length > 2000)
      throw new ReportContextError(
        'Limite operacional de contexto global excedido (2000 registros por pessoa); contate suporte para otimização da consulta, sem apagar histórico.',
      );
    return visible;
  }
  async readPersonalProject(projectId: string, viewerUid: string) {
    this.assertOwner([viewerUid]);
    const project = this.projects.get(projectId);
    if (
      !project ||
      project.type !== 'personal' ||
      !canAccessProject(project, viewerUid)
    )
      return null;
    return project;
  }
  async archivedProjectIds(ids: string[]) {
    return ids.filter((id) => {
      const p = this.projects.get(id);
      return !p || p.archived || p.mergedInto;
    });
  }
  async readTopics(ids: string[], uid: string) {
    this.assertOwner([uid]);
    return Object.fromEntries(
      ids.map((id) => {
        const p = this.projects.get(id);
        return [id, canAccessProject(p, uid) ? p!.topics : []];
      }),
    );
  }
  async readPage(uid: string, limit: number, cursor?: string) {
    const records = (await this.loadContext([uid]))
      .filter((r) => !this.selectedIds || this.selectedIds.has(r.id))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .filter((r) => !cursor || r.id > cursor);
    const page = records.slice(0, limit);
    return {
      records: page,
      scannedCount: page.length,
      nextCursor: records.length > limit ? page.at(-1)!.id : null,
    };
  }
}
