import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { hours } from './report-chart';

/** View model only: callers must supply server-calculated allocations and safe labels. */
export type TopicReportBucket = {
  projectId: string;
  topicId: string | null;
  projectLabel: string;
  topicLabel: string;
  minutes: number;
  people: { key: string; label: string; minutes: number }[];
};
export const topicBucketKey = (
  bucket: Pick<TopicReportBucket, 'projectId' | 'topicId'>,
) => JSON.stringify([bucket.projectId, bucket.topicId]);

export function TopicReport({
  buckets,
  personal = false,
  unassignedMinutes = 0,
}: {
  buckets: TopicReportBucket[];
  personal?: boolean;
  unassignedMinutes?: number;
}) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const selected = params.get('topic') ?? '';
  const setSelected = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('topic', value);
    else next.delete('topic');
    navigate({
      pathname: location.pathname,
      search: next.toString() ? '?' + next.toString() : '',
      hash: location.hash,
    });
  };
  const active = buckets.find((bucket) => topicBucketKey(bucket) === selected);
  const maximum = Math.max(0, ...buckets.map((bucket) => bucket.minutes));
  return (
    <Paper
      component="section"
      aria-label="Tempo por assunto"
      sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}
    >
      <Stack spacing={2}>
        <Typography component="h3" variant="h6">
          Tempo por assunto
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Distribuição informada pelo relatório. Assuntos de projetos diferentes
          permanecem separados; tempo sem divisão não é repartido
          automaticamente.
        </Typography>
        <Typography>
          Não distribuído: {hours(unassignedMinutes)}. Tempo sem atribuição
          válida; não é distribuído por projeto ou pessoa.
        </Typography>
        {buckets.length === 0 ? (
          <Typography color="text.secondary">
            Nenhum assunto com tempo neste escopo.
          </Typography>
        ) : (
          <>
            <TextField
              select
              label="Assunto e projeto"
              value={active ? selected : ''}
              onChange={(event) => setSelected(event.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="">Todos os assuntos</MenuItem>
              {buckets.map((bucket) => (
                <MenuItem
                  key={topicBucketKey(bucket)}
                  value={topicBucketKey(bucket)}
                >
                  {bucket.projectLabel} ·{' '}
                  {bucket.topicId === null
                    ? 'Não distribuído'
                    : bucket.topicLabel}
                </MenuItem>
              ))}
            </TextField>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {(active ? [active] : buckets).map((bucket) => (
                <Box
                  component="li"
                  key={topicBucketKey(bucket)}
                  sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider' }}
                >
                  <Stack
                    direction="row"
                    sx={{ justifyContent: 'space-between', gap: 2 }}
                  >
                    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      <Typography>
                        {bucket.topicId === null
                          ? 'Não distribuído'
                          : bucket.topicLabel}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {bucket.projectLabel}
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {hours(bucket.minutes)}
                    </Typography>
                  </Stack>
                  <Box
                    aria-hidden="true"
                    sx={{
                      height: 6,
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                      mt: 1,
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        height: '100%',
                        bgcolor: 'primary.main',
                        width:
                          (maximum > 0 ? (bucket.minutes / maximum) * 100 : 0) +
                          '%',
                      }}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
            {active && (
              <Box>
                <Typography component="h4" variant="subtitle1">
                  {personal
                    ? 'Meu tempo neste assunto'
                    : 'Pessoas neste assunto'}
                </Typography>
                <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                  {active.people.map((person) => (
                    <Box
                      component="li"
                      key={person.key}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 2,
                        py: 1,
                      }}
                    >
                      <Typography sx={{ overflowWrap: 'anywhere' }}>
                        {person.label}
                      </Typography>
                      <Typography sx={{ whiteSpace: 'nowrap' }}>
                        {hours(person.minutes)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                {active.people.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Detalhamento por pessoa indisponível neste escopo.
                  </Typography>
                )}
              </Box>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
