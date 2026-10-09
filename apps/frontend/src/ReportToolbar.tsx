import {
  QueryToolbar,
  QueryToolbarField,
  QueryPeriodControls,
} from './QueryToolbar';
import {
  IconButton,
  Tooltip,
  Typography,
  Box,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { UiIcon } from './UiIcons';
import { ProjectSelector } from './ProjectSelector';
import { usePrivacy } from './privacy';
import type { ProjectOption } from './project-search';
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
        <Box>
          <Typography variant="caption" color="text.secondary">
            Tempo registrado
          </Typography>
          <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {total}
          </Typography>
        </Box>
      }
      actions={
        <>
          {' '}
          {(fromDate || toDate || projectId) && (
            <Tooltip title="Limpar filtros">
              <IconButton
                aria-label="Limpar filtros"
                onClick={() => onFilter('clear', '')}
              >
                <UiIcon kind="eyeoff" />
              </IconButton>
            </Tooltip>
          )}
          {includeArchived !== undefined && (
            <FormControlLabel
              sx={{ m: 0 }}
              control={
                <Checkbox
                  checked={includeArchived}
                  onChange={(e) =>
                    onFilter('includeArchived', String(e.target.checked))
                  }
                />
              }
              label="Arquivados"
            />
          )}
          <Tooltip title="Atualizar">
            <IconButton aria-label="Atualizar" onClick={onRefresh}>
              <UiIcon kind="refresh" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Detalhes do cálculo">
            <IconButton aria-label="Detalhes do cálculo" onClick={onInfo}>
              <UiIcon kind="detail" />
            </IconButton>
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
