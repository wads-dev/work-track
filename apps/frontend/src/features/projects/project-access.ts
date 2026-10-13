import { canAccessProject } from '@work-track/core/registration/domain/project-access';
export type ProjectScope = 'personal' | 'work';
export type ScopePreview = {
  mode: 'preview';
  projectId: string;
  fromType: ProjectScope;
  toType: ProjectScope;
  recordCount?: number;
  requiresSharingAcknowledgement: boolean;
  warnings: string[];
  previewToken: string;
};
export function scopeDisabledReason(
  project: Record<string, unknown>,
  uid: string,
) {
  if (!canAccessProject(project, uid))
    return 'Projeto indisponível: Pessoal exige o criador; Global exige autenticação.';
  if (project.archived === true || project.mergedInto || project.mergeLock)
    return 'Projeto arquivado, mesclado ou bloqueado: alteração indisponível.';
  if (project.type !== 'personal' && project.type !== 'work')
    return 'Escopo não identificado: alteração indisponível.';
  return '';
}
export function scopeConfirmation(
  intent: {
    projectId: string;
    type: ProjectScope;
    requestId: string;
    reason: string;
  },
  preview: ScopePreview,
  ack: boolean,
) {
  if (
    preview.projectId !== intent.projectId ||
    preview.toType !== intent.type ||
    !preview.previewToken
  )
    throw Error('Confira uma nova prévia.');
  if (
    ((preview.fromType === 'personal' && intent.type === 'work') ||
      preview.requiresSharingAcknowledgement) &&
    !ack
  )
    throw Error('Confirme o compartilhamento com a organização.');
  return {
    ...intent,
    confirmed: true,
    previewToken: preview.previewToken,
    acknowledgeSharedDestination:
      ((preview.fromType === 'personal' && intent.type === 'work') ||
        preview.requiresSharingAcknowledgement) &&
      ack,
  };
}
