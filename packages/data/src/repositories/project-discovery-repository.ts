import type {
  Project,
  ProjectSelection,
} from '@work-track/core/registration/domain/work-model';
import { searchProjects } from '@work-track/core/registration/domain/project-search';
import {
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
export interface ProjectDiscoveryDocument {
  id: string;
  data: Record<string, unknown>;
}
export interface ProjectDiscoveryPort {
  scanProjects(
    limit: number,
    selection?: ProjectSelection,
  ): Promise<readonly ProjectDiscoveryDocument[]>;
}
/** SDK adapters supply transport; authorization and complete-result budget are shared. */
export class ProjectDiscoveryRepository {
  constructor(private readonly port: ProjectDiscoveryPort) {}
  async list(uid: string, selection?: ProjectSelection) {
    if (!uid) throw new Error('Autenticação obrigatória.');
    const docs = await this.port.scanProjects(1001, selection);
    if (docs.length > 1000)
      throw new Error(
        'Catálogo excede orçamento de leitura; resultado não é parcial.',
      );
    return ProjectDiscoveryRepository.selected(docs, uid, selection);
  }
  /** Firebase cannot query missing archived/mergedInto,
   * normalized substring/bigram similarity or nested topic-title search. Adapters
   * push explicit work/personal type and personal owner predicates before these residuals.
   */
  static selected(
    docs: readonly ProjectDiscoveryDocument[],
    uid: string,
    selection?: ProjectSelection,
  ) {
    const selected = ProjectDiscoveryRepository.authorized(docs, uid).filter(
      (doc) =>
        (!selection?.scope ||
          selection.scope === 'all' ||
          effectiveProjectType(doc.data) === selection.scope) &&
        (!selection ||
          selection.includeArchived ||
          (!doc.data.archived && !doc.data.mergedInto)),
    );
    if (selection?.query !== undefined) {
      const ranked = searchProjects(
        selected.map((doc) => ({ ...doc.data, id: doc.id }) as Project),
        selection.query,
        selection.limit ?? 1000,
      );
      return ranked.map(({ id, ...data }) => ({ id, data }));
    }
    return selection?.limit ? selected.slice(0, selection.limit) : selected;
  }
  static authorized(docs: readonly ProjectDiscoveryDocument[], uid: string) {
    return docs
      .filter((d) => canAccessProject(d.data, uid))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
