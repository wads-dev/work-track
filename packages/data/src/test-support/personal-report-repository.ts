import { resolveTimeMultiplier } from '@work-track/core/registration/domain/time-multipliers';
import { selectedProjectIds } from '@work-track/core/reports/domain/personal-report';
/* eslint-disable @typescript-eslint/require-await -- Test doubles preserve async repository rejection contracts without database I/O. */
import type {
  PersonalReportRepository,
  ReportRecordSelection,
} from '@work-track/core/reports/domain/personal-report';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { ReportContextError } from '@work-track/core/reports/domain/global-estimates';

import type { ReportProjectMetadata } from '../codecs/report-project-metadata.js';
import { matchesReportRecordSelection } from './report-record-selection.js';

/** Compatibility name for callers of the immutable personal snapshot. */
export type ClientReportProject = ReportProjectMetadata;
/** TEST DOUBLE ONLY. In-memory snapshot selection is forbidden in production. */
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
    return visible.map((r) => ({
      ...r,
      timeMultiplier: resolveTimeMultiplier(
        this.projects.get(r.projectId)?.timeMultipliers?.[r.uid],
        r.startedAt,
      ),
    }));
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
  async readPage(
    uid: string,
    limit: number,
    cursor?: string,
    selection?: ReportRecordSelection,
  ) {
    selectedProjectIds(selection);
    const records = (await this.loadContext([uid]))
      .filter(
        (r) =>
          (!this.selectedIds || this.selectedIds.has(r.id)) &&
          matchesReportRecordSelection(r, this.projects, selection),
      )
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
