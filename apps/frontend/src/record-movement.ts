export type MovePreview = {
  mode: 'preview';
  operation: 'move_topic' | 'move_record';
  project_origin: string;
  topic_origin: string;
  project_target: string;
  topic_target: string;
  resolvedTopic: { id: string; title: string; willCreate: boolean };
  recordCount: number;
  recordIds: string[];
  records?: { recordId: string; ownerUid: string; path: string }[];
  participantUids?: string[];
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
  const manifestValid =
    preview.records === undefined
      ? new Set(preview.recordIds).size === preview.recordCount &&
        !('recordOwnerUid' in intent)
      : Array.isArray(preview.records) &&
        preview.records.length === preview.recordCount &&
        new Set(preview.records.map((r) => r.path)).size ===
          preview.recordCount &&
        preview.records.every(
          (r, i) =>
            r.recordId === preview.recordIds[i] &&
            /^[A-Za-z0-9_-]{1,128}$/.test(r.ownerUid) &&
            r.path === 'users/' + r.ownerUid + '/records/' + r.recordId,
        ) &&
        (!('recordOwnerUid' in intent) ||
          preview.records.every((r) => r.ownerUid === intent.recordOwnerUid));
  if (
    preview.mode !== 'preview' ||
    preview.project_target !== intent.project_target ||
    !/^[a-f0-9]{64}$/.test(preview.previewToken) ||
    preview.resolvedTopic?.id !== preview.topic_target ||
    ('topic_target' in intent &&
      intent.topic_target !== preview.topic_target) ||
    preview.operation !==
      ('recordId' in intent ? 'move_record' : 'move_topic') ||
    !Array.isArray(preview.recordIds) ||
    preview.recordCount !== preview.recordIds.length ||
    !manifestValid ||
    preview.recordCount < 1 ||
    preview.recordCount > 100 ||
    ('recordId' in intent && preview.recordCount !== 1) ||
    ('project_origin' in intent &&
      preview.project_origin !== intent.project_origin) ||
    ('topic_origin' in intent &&
      preview.topic_origin !== intent.topic_origin) ||
    ('recordId' in intent &&
      !preview.recordIds.includes(String(intent.recordId)))
  )
    throw Error('Confira uma nova prévia.');
  return { ...intent, confirmed: true, previewToken: preview.previewToken };
}
