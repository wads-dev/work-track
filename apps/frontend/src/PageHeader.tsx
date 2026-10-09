import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
export function PageHeader({
  title,
  context,
  actions,
  children,
}: {
  title: string;
  context: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box
      component="section"
      aria-label={title + ' e filtros'}
      sx={{
        mb: 2,
        p: { xs: 2.5, sm: 3 },
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: '12px',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0,1fr)',
            sm: 'minmax(0,1fr) auto',
          },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Box>
          <Typography component="h1" sx={{ fontSize: 22, fontWeight: 650 }}>
            {title}
          </Typography>
          <Typography sx={{ fontSize: 14 }} color="text.secondary">
            {context}
          </Typography>
        </Box>
        {actions}
      </Box>
      {children}
    </Box>
  );
}
