import {
  decodeReportProjectMetadata,
  type ReportProjectMetadata,
  type ReportProjectMetadataMode,
} from '../codecs/report-project-metadata.js';
import type {
  DocumentReadPort,
  ReadDocument,
} from '../ports/document-read-port.js';
import { BaseReadRepository } from './base-read-repository.js';

export class ProjectCatalogRepository extends BaseReadRepository<ReportProjectMetadata> {
  constructor(read: DocumentReadPort, mode: ReportProjectMetadataMode) {
    super(read, (document) =>
      ProjectCatalogRepository.decodeDocument(document, mode),
    );
  }

  /** Synchronous projection for existing listener snapshots: never performs a read. */
  static decodeDocument(
    document: ReadDocument,
    mode: ReportProjectMetadataMode,
  ): ReportProjectMetadata | undefined {
    return document.data === undefined
      ? undefined
      : decodeReportProjectMetadata(document.data, mode);
  }

  async readCatalog(
    ids: readonly string[],
  ): Promise<Map<string, ReportProjectMetadata>> {
    const unique = [...new Set(ids)];
    const catalog = new Map<string, ReportProjectMetadata>();
    for (let index = 0; index < unique.length; index += 100) {
      const batch = await this.readMany(
        'projects',
        unique.slice(index, index + 100),
      );
      for (const [id, project] of batch) catalog.set(id, project);
    }
    return catalog;
  }
}
