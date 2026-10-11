import {
  QueryToolbar,
  QueryToolbarField,
  QueryPeriodControls,
} from '../../shared/ui/QueryToolbar';
import { Button } from '../../components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { UiIcon } from '../../shared/ui/UiIcons';
import { ProjectSelector } from '../projects/ProjectSelector';
import { usePrivacy } from '../../shared/ui/privacy';
import type { ProjectOption } from '../projects/project-search';
export function ReportToolbar({
  total,
  fromDate,
  toDate,
  projectId,
  projects,
  onFilter,
  onRefresh,
  onInfo,
  includeArchived,
}: {
  total: string;
  fromDate: string;
  toDate: string;
  projectId: string;
  projects: ProjectOption[];
  onFilter: (key: string, value: string) => void;
  onRefresh: () => void;
  onInfo: () => void;
  includeArchived?: boolean;
}) {
  const { revealed } = usePrivacy();
  return (
    <QueryToolbar
      label="Filtros do relatório"
      summary={
        <div>
          <p className="text-xs text-muted-foreground">Tempo registrado</p>
          <p className="text-2xl tabular-nums">{total}</p>
        </div>
      }
      actions={
        <>
          {' '}
          {(fromDate || toDate || projectId) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Limpar filtros"
                  title="Limpar filtros"
                  onClick={() => onFilter('clear', '')}
                >
                  <UiIcon kind="eyeoff" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Limpar filtros</TooltipContent>
            </Tooltip>
          )}
          {includeArchived !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Incluir arquivados"
                  aria-pressed={includeArchived}
                  onClick={() =>
                    onFilter('includeArchived', String(!includeArchived))
                  }
                >
                  <UiIcon kind={includeArchived ? 'archive' : 'archiveoff'} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {includeArchived ? 'Ocultar arquivados' : 'Incluir arquivados'}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Atualizar"
                title="Atualizar"
                onClick={onRefresh}
              >
                <UiIcon kind="refresh" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Atualizar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Detalhes do cálculo"
                title="Detalhes do cálculo"
                onClick={onInfo}
              >
                <UiIcon kind="detail" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Detalhes do cálculo</TooltipContent>
          </Tooltip>
        </>
      }
    >
      <QueryPeriodControls
        fromDate={fromDate}
        toDate={toDate}
        onFromChange={(value) => onFilter('fromDate', value)}
        onToChange={(value) => onFilter('toDate', value)}
      />
      <QueryToolbarField kind="project">
        {' '}
        <ProjectSelector
          key={String(revealed)}
          projects={projects}
          projectId={projectId}
          onChange={(id) => onFilter('projectId', id)}
        />
      </QueryToolbarField>
    </QueryToolbar>
  );
}
