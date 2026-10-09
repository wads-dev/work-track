import { Box, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';
export function Surface({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}>
      {title && (
        <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}
      {children}
    </Paper>
  );
}
export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
      <Typography variant="h6" color="text.primary">
        {title}
      </Typography>
      {detail && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {detail}
        </Typography>
      )}
    </Box>
  );
}
