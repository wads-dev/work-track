import { isHidden } from '../../shared/ui/privacy';
import type { DescriptionSource } from '../../data/repositories/browser-detail-repository';

export function calendarEventDetails(
  item: {
    id: string;
    uid?: string;
    projectId: string;
    topics?: { label: string }[];
  },
  source: DescriptionSource | undefined,
  project: Record<string, unknown> | undefined,
  revealed: boolean,
  viewerUid: string,
) {
  if (isHidden(project, revealed))
    return { topics: 'Tópicos reservados', summary: 'Conteúdo oculto.' };
  // Defense in depth for a stale description response; selection is repository-owned.
  const matches =
    source?.id === item.id &&
    source.uid === (item.uid || viewerUid) &&
    source.projectId === item.projectId;
  const interpretation = matches ? source.interpretation : undefined;
  const original = matches ? source.originalText : undefined;
  const summary =
    typeof interpretation === 'string' && interpretation.trim()
      ? interpretation
      : original;
  return {
    topics:
      item.topics?.map((t) => t.label).join(' · ') || 'Sem tópico informado',
    summary:
      typeof summary === 'string' && summary.trim()
        ? summary.trim()
        : 'Sem descrição informada',
  };
}
