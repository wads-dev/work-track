import { Box, TextField, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
const rowSx = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 1.5,
  minWidth: 0,
} as const;
/** Shared compact structure and sizing. Consumers supply domain controls, never local grids. */
export function QueryToolbarField({
  children,
  kind = 'standard',
}: {
  children: ReactNode;
  kind?: 'date' | 'project' | 'search' | 'standard';
}) {
  const width = { date: 160, project: 240, search: 260, standard: 180 }[kind];
  return (
    <Box
      data-query-field={kind}
      sx={{
        width: { xs: kind === 'date' ? 'calc(50% - 6px)' : '100%', sm: width },
        minWidth: 0,
        flexShrink: 0,
        '& > *': { width: '100% !important', minWidth: '0 !important' },
        '& .MuiInputBase-root': { height: { xs: 44, sm: 40 } },
        '& .MuiInputBase-input': { fontSize: 14 },
        '& .MuiAutocomplete-inputRoot': { flexWrap: 'nowrap' },
        '& .MuiFormControlLabel-root': { m: 0, minHeight: 40 },
        '& .MuiFormControlLabel-label': { fontSize: 13 },
      }}
    >
      {children}
    </Box>
  );
}
export function QueryToolbar({
  label,
  children,
  summary,
  secondary,
  actions,
  sx,
}: {
  label: string;
  children: ReactNode;
  summary?: ReactNode;
  secondary?: ReactNode;
  actions?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={[
        {
          ...rowSx,
          p: 2,
          border: 1,
          borderColor: 'divider',
          borderRadius: '12px',
          bgcolor: 'background.paper',
          '& .MuiIconButton-root': {
            width: { xs: 44, sm: 40 },
            height: { xs: 44, sm: 40 },
          },
          '& .MuiButton-root': { minHeight: { xs: 44, sm: 40 } },
          '& .MuiFormControlLabel-root': {
            m: 0,
            minHeight: { xs: 44, sm: 40 },
          },
          '& .MuiFormControlLabel-label': {
            fontSize: 13,
            whiteSpace: 'nowrap',
          },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Box data-query-row="primary" sx={{ display: 'contents' }}>
        {summary && (
          <Box
            data-query-slot="summary"
            sx={{
              minWidth: 130,
              width: { xs: '100%', sm: 'auto' },
              flexBasis: { xs: '100%', sm: 'auto' },
            }}
          >
            {summary}
          </Box>
        )}
        <Box
          data-query-slot="controls"
          sx={{
            ...rowSx,
            flex: { xs: '1 0 100%', sm: 1 },
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          {children}
        </Box>
        {actions && (
          <Box
            data-query-slot="actions"
            sx={{
              ...rowSx,
              justifyContent: 'flex-end',
              order: { xs: 3, sm: 0 },
              ml: { sm: 'auto' },
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            {actions}
          </Box>
        )}
      </Box>
      {secondary && (
        <Box
          data-query-row="secondary"
          sx={{
            ...rowSx,
            width: '100%',
            order: { xs: 2, sm: 1 },
            pt: 1.5,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {secondary}
        </Box>
      )}
    </Box>
  );
}
export function QueryPeriodControls({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
}: {
  fromDate: string;
  toDate: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <>
      <QueryToolbarField kind="date">
        <TextField
          size="small"
          type="date"
          label="Inicial"
          value={fromDate}
          onChange={(e) => onFromChange(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </QueryToolbarField>
      <QueryToolbarField kind="date">
        <TextField
          size="small"
          type="date"
          label="Final"
          value={toDate}
          onChange={(e) => onToChange(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </QueryToolbarField>
    </>
  );
}
