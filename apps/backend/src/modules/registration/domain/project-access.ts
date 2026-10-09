import { ProjectManagementError } from './project-management.js';
export type ProjectAccessMetadata = { type?: string; createdBy?: string };
export function effectiveProjectType(
  project: ProjectAccessMetadata,
): 'personal' | 'work' | 'invalid' {
  return project.type === undefined || project.type === 'work'
    ? 'work'
    : project.type === 'personal'
      ? 'personal'
      : 'invalid';
}
export function canAccessProject(
  project: ProjectAccessMetadata | undefined,
  uid: string,
): boolean {
  if (!project || !uid) return false;
  const type = effectiveProjectType(project);
  return type === 'work' || (type === 'personal' && project.createdBy === uid);
}
export function assertProjectAccess(
  project: ProjectAccessMetadata | undefined,
  uid: string,
): asserts project is ProjectAccessMetadata {
  if (!canAccessProject(project, uid))
    throw new ProjectManagementError('not-found', 'Projeto não encontrado.');
}
export function assertProjectMergeAccess(
  source: ProjectAccessMetadata | undefined,
  target: ProjectAccessMetadata | undefined,
  uid: string,
) {
  assertProjectAccess(source, uid);
  assertProjectAccess(target, uid);
  if (
    [source, target].some(
      (p) =>
        'topics' in p &&
        Array.isArray(p.topics) &&
        p.topics.some(
          (t: unknown) =>
            typeof t === 'object' &&
            t !== null &&
            'mergedIntoTopicId' in t &&
            Boolean(t.mergedIntoTopicId),
        ),
    )
  )
    throw new ProjectManagementError(
      'failed-precondition',
      'Projetos com aliases de tópicos exigem migração canônica dedicada; mesclagem entre projetos indisponível para preservar histórico.',
    );
  if (
    effectiveProjectType(source) !== effectiveProjectType(target) ||
    (effectiveProjectType(source) === 'personal' &&
      source.createdBy !== target.createdBy)
  )
    throw new ProjectManagementError(
      'failed-precondition',
      'Não é permitido unificar projetos com escopos de acesso diferentes.',
    );
}
