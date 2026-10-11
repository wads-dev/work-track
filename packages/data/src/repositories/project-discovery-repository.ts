import { canAccessProject } from '@work-track/core/registration/domain/project-access';
export interface ProjectDiscoveryDocument {
  id: string;
  data: Record<string, unknown>;
}
export interface ProjectDiscoveryPort {
  scanProjects(limit: number): Promise<readonly ProjectDiscoveryDocument[]>;
}
/** SDK adapters supply transport; authorization and complete-result budget are shared. */
export class ProjectDiscoveryRepository {
  constructor(private readonly port: ProjectDiscoveryPort) {}
  async list(uid: string) {
    if (!uid) throw new Error('Autenticação obrigatória.');
    const docs = await this.port.scanProjects(1001);
    if (docs.length > 1000)
      throw new Error(
        'Catálogo excede orçamento de leitura; resultado não é parcial.',
      );
    return ProjectDiscoveryRepository.authorized(docs, uid);
  }
  static authorized(docs: readonly ProjectDiscoveryDocument[], uid: string) {
    return docs
      .filter((d) => canAccessProject(d.data, uid))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
