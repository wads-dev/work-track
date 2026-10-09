import {
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  Box,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { UiIcon } from './UiIcons';
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
  projects: { id: string; label: string }[];
  onFilter: (key: string, value: string) => void;
  onRefresh: () => void;
  onInfo: () => void;
  includeArchived?: boolean;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{
        alignItems: 'center',
        flexWrap: 'wrap',
        p: { xs: 1.5, sm: 2 },
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: '12px',
        display: { xs: 'grid', sm: 'flex' },
        gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
        '& > :first-child': { gridColumn: { xs: '1 / -1', sm: 'auto' } },
        minWidth: 0,
      }}
    >
      <Box sx={{ mr: { sm: 2 }, minWidth: 130 }}>
        <Typography variant="caption" color="text.secondary">
          Tempo registrado
        </Typography>
        <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {total}
        </Typography>
      </Box>
      <TextField
        size="small"
        sx={{ width: { xs: '100%', sm: 150 }, minWidth: 0 }}
        type="date"
        label="Inicial"
        value={fromDate}
        onChange={(e) => onFilter('fromDate', e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        size="small"
        sx={{ width: { xs: '100%', sm: 150 }, minWidth: 0 }}
        type="date"
        label="Final"
        value={toDate}
        onChange={(e) => onFilter('toDate', e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        size="small"
        select
        label="Projeto"
        value={projectId}
        onChange={(e) => onFilter('projectId', e.target.value)}
        sx={{
          minWidth: 0,
          width: { xs: '100%', sm: 200 },
          gridColumn: { xs: '1 / -1', sm: 'auto' },
        }}
      >
        <MenuItem value="">Todos</MenuItem>
        {projects.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.label}
          </MenuItem>
        ))}
      </TextField>
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
    </Stack>
  );
}
