import { Badge } from '../../components/ui/badge';
import { date, objects, text, type Row } from '../../shared/data';
import { MetadataLink } from '../../shared/ui/MetadataLink';
import { isHidden, safeProject } from '../../shared/ui/privacy';
import { ListTable } from '../../shared/ui/ListTable';
import { projectColors } from '../../shared/ui/project-colors';
import { sortProjectRows } from './project-list';
export function ProjectList({
  state,
  catalog,
  revealed,
  hideHeading = true,
}: {
  state: { rows: Row[]; loading: boolean; error: string; retry: () => void };
  catalog: Row[];
  revealed: boolean;
  hideHeading?: boolean;
}) {
  const color = projectColors(catalog, revealed);
  const projects = new Map(catalog.map((row) => [row.id, row.data]));
  return (
    <ListTable
      label="Projetos"
      caption="Projetos — catálogo autorizado em ordem alfabética. Tópicos abaixo de cada projeto."
      hideHeading={hideHeading}
      mobile="table"
      rows={sortProjectRows(state.rows)}
      rowKey={(row) => row.id}
      loading={state.loading}
      error={state.error}
      retry={state.retry}
      empty="Nenhum dado disponível em projetos."
      rowColor={(row) => color(row.id)}
      columns={[
        {
          key: 'project',
          label: 'Projeto',
          className: 'font-medium',
          cell: (row) => (
            <MetadataLink
              projectId={row.id}
              project={projects.get(row.id)}
              revealed={revealed}
            />
          ),
        },
        {
          key: 'created',
          label: 'Criado em',
          className:
            'w-32 text-right text-xs text-muted-foreground sm:w-48 sm:text-sm',
          cell: (row) =>
            date(safeProject(projects.get(row.id), revealed).createdAt),
        },
      ]}
      detail={(row) => {
        const project = projects.get(row.id);
        const topics = objects(safeProject(project, revealed).topics);
        return (
          <div
            aria-label="Tópicos"
            className="flex min-w-0 flex-wrap items-center gap-2"
          >
            {topics.length === 0 && (
              <span className="text-xs text-muted-foreground">
                {isHidden(project, revealed)
                  ? 'Tópicos reservados'
                  : 'Nenhum tópico'}
              </span>
            )}
            {topics.map((topic, index) => (
              <Badge
                key={text(topic.id, String(index))}
                variant="secondary"
                className="max-w-full whitespace-normal [overflow-wrap:anywhere]"
              >
                {text(topic.id, '') ? (
                  <MetadataLink
                    projectId={row.id}
                    project={project}
                    revealed={revealed}
                    topicId={text(topic.id)}
                  />
                ) : (
                  <span>{text(topic.title)}</span>
                )}
              </Badge>
            ))}
          </div>
        );
      }}
    />
  );
}
