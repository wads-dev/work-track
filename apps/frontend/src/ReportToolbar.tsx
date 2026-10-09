import {
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
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
}: {
  total: string;
  fromDate: string;
  toDate: string;
  projectId: string;
  projects: { id: string; label: string }[];
  onFilter: (key: string, value: string) => void;
  onRefresh: () => void;
  onInfo: () => void;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}
    >
      <Typography variant="h5" sx={{ mr: 'auto', flexGrow: 1 }}>
        {total}
      </Typography>
      <TextField
        size="small"
        sx={{ width: 150, minWidth: 130 }}
        type="date"
        label="Inicial"
        value={fromDate}
        onChange={(e) => onFilter('fromDate', e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        size="small"
        sx={{ width: 150, minWidth: 130 }}
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
        sx={{ minWidth: 160, maxWidth: 200 }}
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
