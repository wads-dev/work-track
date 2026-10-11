import { ProjectAppearance } from '@work-track/core/registration/domain/project-color';
import { Alert } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { date, objects, text, type Row } from '../../shared/data';
import { MetadataLink } from '../../shared/ui/MetadataLink';
import { isHidden, safeProject } from '../../shared/ui/privacy';
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
  // Use the complete, privacy-safe authorized catalog, just like the calendar.
  const colorCatalog = catalog.map((row) => ({
    id: row.id,
    color: safeProject(row.data, revealed).color,
  }));
  const projects = new Map(catalog.map((row) => [row.id, row.data]));
  return (
    <section aria-label="Projetos" className="mb-8">
      {!hideHeading && (
        <h2 className="mb-4 text-2xl font-semibold">Projetos</h2>
      )}
      {state.loading ? (
        <div role="status" className="flex items-center gap-4 p-4">
          <Skeleton className="h-6 w-6 rounded-full" aria-label="Carregando" />
          <span>Carregando projetos…</span>
        </div>
      ) : state.error ? (
        <Alert variant="destructive">
          {state.error}
          <Button onClick={state.retry}>Tentar novamente</Button>
        </Alert>
      ) : state.rows.length === 0 ? (
        <Alert>Nenhum dado disponível em projetos.</Alert>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className="table-fixed">
            <caption className="sr-only">
              Projetos — catálogo autorizado em ordem alfabética. Tópicos abaixo
              de cada projeto.
            </caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className="px-4">
                  Projeto
                </TableHead>
                <TableHead scope="col" className="w-32 px-4 text-right sm:w-48">
                  Criado em
                </TableHead>
              </TableRow>
            </TableHeader>
            {sortProjectRows(state.rows).map((row) => {
              const project = projects.get(row.id);
              const data = safeProject(project, revealed);
              const color = new ProjectAppearance(
                colorCatalog.find((p) => p.id === row.id) ?? { id: row.id },
              ).getColor(colorCatalog);
              const topics = objects(data.topics);
              return (
                <tbody
                  key={row.id}
                  className="border-b last:border-b-0 hover:bg-muted/50"
                >
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell
                      className="border-l-4 px-4 pt-3 pb-1 align-top whitespace-normal font-medium [overflow-wrap:anywhere]"
                      style={{ borderLeftColor: color }}
                    >
                      <MetadataLink
                        projectId={row.id}
                        project={project}
                        revealed={revealed}
                      />
                    </TableCell>
                    <TableCell className="px-4 pt-3 pb-1 text-right align-top whitespace-normal text-xs text-muted-foreground sm:text-sm">
                      {date(data.createdAt)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell
                      colSpan={2}
                      className="border-l-4 px-4 pt-1 pb-3 whitespace-normal"
                      style={{ borderLeftColor: color }}
                    >
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
                    </TableCell>
                  </TableRow>
                </tbody>
              );
            })}
          </Table>
        </div>
      )}
    </section>
  );
}
