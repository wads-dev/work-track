export type MovePreview = {
  mode: 'preview';
  operation: 'move_subject' | 'move_record';
  project_origin: string;
  subject_origin: string;
  project_target: string;
  subject_target: string;
  resolvedSubject: { id: string; title: string; willCreate: boolean };
  recordCount: number;
  recordIds: string[];
  warnings: string[];
  previewToken: string;
};
export function compatibleMoveProject(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
) {
  const type = (p: Record<string, unknown>) =>
    p.type === 'personal'
      ? 'personal'
      : p.type === undefined || p.type === 'work'
        ? 'work'
        : '';
  const aliases = (p: Record<string, unknown>) =>
    Array.isArray(p.topics) &&
    p.topics.some((t) => t && typeof t === 'object' && t.mergedIntoTopicId);
  return (
    !aliases(source) &&
    !aliases(target) &&
    !source.archived &&
    !source.mergedInto &&
    !source.mergeLock &&
    !!type(source) &&
    type(source) === type(target) &&
    !target.archived &&
    !target.mergedInto &&
    !target.mergeLock
  );
}
export function moveConfirmation(
  intent: Record<string, unknown>,
  preview: MovePreview,
  ack: boolean,
) {
  if (!ack) throw Error('Confirme o impacto da transferência.');
  if (
    preview.mode !== 'preview' ||
    preview.project_target !== intent.project_target ||
    !/^[a-f0-9]{64}$/.test(preview.previewToken) ||
    preview.resolvedSubject?.id !== preview.subject_target ||
    ('subject_target' in intent &&
      intent.subject_target !== preview.subject_target) ||
    preview.operation !==
      ('recordId' in intent ? 'move_record' : 'move_subject') ||
    !Array.isArray(preview.recordIds) ||
    preview.recordCount !== preview.recordIds.length ||
    new Set(preview.recordIds).size !== preview.recordCount ||
    preview.recordCount < 1 ||
    preview.recordCount > 100 ||
    ('recordId' in intent && preview.recordCount !== 1) ||
    ('project_origin' in intent &&
      preview.project_origin !== intent.project_origin) ||
    ('subject_origin' in intent &&
      preview.subject_origin !== intent.subject_origin) ||
    ('recordId' in intent &&
      !preview.recordIds.includes(String(intent.recordId)))
  )
    throw Error('Confira uma nova prévia.');
  return { ...intent, confirmed: true, previewToken: preview.previewToken };
}
