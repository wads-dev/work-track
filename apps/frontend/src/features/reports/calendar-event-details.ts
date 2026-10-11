import { isHidden } from '../../shared/ui/privacy';

export function calendarEventDetails(
  item: {
    id: string;
    uid?: string;
    projectId: string;
    topics?: { label: string }[];
  },
  records: readonly {
    id: string;
    uid: string;
    projectId: string;
    interpretation?: unknown;
    originalText?: unknown;
  }[],
  project: Record<string, unknown> | undefined,
  revealed: boolean,
  viewerUid: string,
) {
  if (isHidden(project, revealed))
    return { topics: 'Tópicos reservados', summary: 'Conteúdo oculto.' };
  const source = records.find(
    (r) =>
      r.id === item.id &&
      r.uid === (item.uid || viewerUid) &&
      r.projectId === item.projectId,
  ) as Record<string, unknown> | undefined;
  const summary = [source?.interpretation, source?.originalText].find(
    (value) => typeof value === 'string' && value.trim(),
  );
  return {
    topics:
      item.topics?.map((t) => t.label).join(' · ') || 'Sem tópico informado',
    summary:
      typeof summary === 'string' ? summary.trim() : 'Sem descrição informada',
  };
}
