import { Box, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
/** Shared query surface; consumers own domain controls, not navigation or titles. */
export function QueryToolbar({
  label,
  children,
  actions,
  sx,
}: {
  label: string;
  children: ReactNode;
  actions?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={[
        {
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          minWidth: 0,
          p: { xs: 2, sm: 2.5 },
          border: 1,
          borderColor: 'divider',
          borderRadius: '12px',
          bgcolor: 'background.paper',
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {children}
      {actions}
    </Box>
  );
}
