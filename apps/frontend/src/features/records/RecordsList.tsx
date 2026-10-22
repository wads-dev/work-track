import { Link as RouterLink } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { date, objects, text, type Row } from '../../shared/data';
import { ListTable } from '../../shared/ui/ListTable';
import { MetadataLink } from '../../shared/ui/MetadataLink';
import { isHidden } from '../../shared/ui/privacy';
import { projectColors } from '../../shared/ui/project-colors';
import { UiIcon } from '../../shared/ui/UiIcons';
import { contextualRecordPath } from '../../app/routes';
import { isAlertOpen } from '../pending/pending-utils';
import { pendingCalendarPath } from '../pending/pending-calendar';
export function RecordsList({
  state,
  catalog,
  revealed,
  pathname,
  search,
  complete = true,
  hideHeading = true,
  pending = false,
}: {
  state: { rows: Row[]; loading: boolean; error: string; retry: () => void };
  catalog: Row[];
  revealed: boolean;
  pathname: string;
  search: string;
  complete?: boolean;
  hideHeading?: boolean;
  pending?: boolean;
}) {
  const color = projectColors(catalog, revealed);
  const projects = new Map(catalog.map((row) => [row.id, row.data]));
  const label = pending ? 'Pendências' : 'Meus registros';
  return (
    <ListTable
      label={label}
      caption={
        label + ' — registros em ordem de início, mais recentes primeiro.'
      }
      hideHeading={hideHeading}
      rows={state.rows}
      loading={state.loading}
      error={state.error}
      retry={state.retry}
      rowKey={(row) => row.id}
      empty={
        !complete
          ? 'Sem resultados nos dados locais disponíveis. Aguarde a sincronização para consultar todo o histórico.'
          : pending
            ? 'Tudo em dia. Você não tem registros sem finalização.'
            : 'Nenhum registro encontrado para os filtros selecionados.'
      }
      rowColor={(row) => color(text(row.data.projectId, ''))}
      columns={[
        {
          key: 'project',
          label: 'Projeto / tópicos',
          cell: (row) => {
            const project = projects.get(text(row.data.projectId, ''));
            return (
              <div className="space-y-2">
                <div className="font-medium">
                  <MetadataLink
                    projectId={text(row.data.projectId, '')}
                    project={project}
                    revealed={revealed}
                  />
                </div>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {isHidden(project, revealed) ? (
                    <span className="text-xs text-muted-foreground">
                      Tópicos reservados
                    </span>
                  ) : (
                    objects(row.data.topics).map((topic, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="max-w-full whitespace-normal [overflow-wrap:anywhere]"
                      >
                        {text(topic.topicId, '') ? (
                          <MetadataLink
                            projectId={text(row.data.projectId, '')}
                            project={project}
                            revealed={revealed}
                            topicId={text(topic.topicId)}
                          />
                        ) : (
                          'Tópico indisponível'
                        )}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            );
          },
        },
        {
          key: 'dates',
          label: pending ? 'Início' : 'Início / fim',
          className: 'w-48 lg:w-64',
          cell: (row) => (
            <div className="space-y-1">
              <p>{date(row.data.startedAt, 'America/Sao_Paulo')}</p>
              {pending ? (
                isAlertOpen(row.data) && (
                  <Badge variant="outline">Aberto há mais de 8 h</Badge>
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  {row.data.endedAt
                    ? date(row.data.endedAt, 'America/Sao_Paulo')
                    : 'Fim não informado'}
                </p>
              )}
            </div>
          ),
        },
        {
          key: 'details',
          label: pending ? 'Revisar' : 'Detalhes',
          className: pending ? 'w-32 text-right' : 'w-20 text-right',
          cell: (row) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size={pending ? 'sm' : 'icon'}
                  className="shrink-0"
                >
                  <RouterLink
                    to={
                      pending
                        ? pendingCalendarPath(row.id, row.data.startedAt)
                        : contextualRecordPath(pathname, search, row.id)
                    }
                    aria-label={
                      pending
                        ? 'Revisar fim do registro'
                        : 'Abrir detalhes e auditoria do registro'
                    }
                  >
                    <UiIcon kind="detail" />
                    {pending && 'Revisar fim'}
                  </RouterLink>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {pending
                  ? 'Revisar fim sem encerramento automático'
                  : 'Abrir detalhes e auditoria'}
              </TooltipContent>
            </Tooltip>
          ),
        },
      ]}
    />
  );
}
