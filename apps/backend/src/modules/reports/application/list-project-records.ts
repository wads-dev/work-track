import type { ReportRecordsRepository } from '../domain/report-record.js';
export class ListProjectRecords {
  constructor(private readonly repository: ReportRecordsRepository) {}
  execute(projectId: string, limit = 100, viewerUid?: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(projectId))
      throw new Error('Projeto inválido.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new Error('Limite inválido.');
    return this.repository.listByProject(projectId, limit, viewerUid);
  }
}
