import { createContext, useContext } from 'react';
export const PrivacyContext = createContext({ revealed: false });
export const usePrivacy = () => useContext(PrivacyContext);
export function isHidden(
  project: Record<string, unknown> | undefined,
  revealed: boolean,
) {
  return !project || (!revealed && project.confidential === true);
}
export function safeProject(
  project: Record<string, unknown> | undefined,
  revealed: boolean,
): Record<string, unknown> {
  if (project && !isHidden(project, revealed)) return project;
  return {
    id: project?.id,
    title: 'Projeto reservado',
    description: 'Dados ocultos no modo live.',
    confidential: true,
    topics: [],
  };
}
export function safeRecord(
  record: Record<string, unknown>,
  hidden: boolean,
): Record<string, unknown> {
  if (!hidden) return record;
  return {
    id: record.id,
    uid: record.uid,
    projectId: record.projectId,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    timeZone: record.timeZone,
    recordedAt: record.recordedAt,
    originalText: 'Oculto no modo live',
    interpretation: 'Oculto no modo live',
    projectSnapshot: { title: 'Projeto reservado' },
    topicSnapshots: [],
    topics: [],
  };
}
