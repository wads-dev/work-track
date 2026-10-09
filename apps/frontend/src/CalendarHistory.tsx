import { Button, Stack, Typography, Alert } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { CalendarTimeline } from './CalendarTimeline';
import { addDays } from './calendar-utils';
export function CalendarHistory({
  weeks,
  occurrences,
  ...props
}: {
  weeks: string[];
  occurrences: { week: string; occurrenceCount: number }[];
} & Omit<Parameters<typeof CalendarTimeline>[0], 'day' | 'view'>) {
  const [params, setParams] = useSearchParams();
  const pages = Math.max(1, Math.ceil(weeks.length / 4));
  const raw = Number(params.get('historyPage') || 0);
  const page = Number.isInteger(raw) && raw >= 0 ? Math.min(raw, pages - 1) : 0;
  const update = (value: number) => {
    const next = new URLSearchParams(params);
    next.set('historyPage', String(value));
    setParams(next);
  };
  if (!weeks.length)
    return (
      <Alert severity="info">
        Nenhuma semana com atividade para os filtros selecionados.
      </Alert>
    );
  return (
    <Stack spacing={2}>
      <Typography variant="body2">
        Todas as semanas com atividade · {weeks.length} semanas · página{' '}
        {page + 1} de {pages}. Apenas semanas com atividade são exibidas; totais
        abrangem todo o histórico autorizado.
      </Typography>
      {weeks.slice(page * 4, page * 4 + 4).map((week) => (
        <Stack spacing={1} key={week}>
          <Typography component="h2" variant="h6">
            Semana de {week} a {addDays(week, 6)}
          </Typography>
          <Typography variant="body2">
            {occurrences.find((o) => o.week === week)?.occurrenceCount ?? 0}{' '}
            registros iniciados nesta semana. Registros sem duração computável
            não geram barras nem horas.
          </Typography>
          <CalendarTimeline {...props} day={week} view="week" />
        </Stack>
      ))}
      <Stack direction="row" spacing={1}>
        <Button disabled={page === 0} onClick={() => update(page - 1)}>
          Semanas anteriores
        </Button>
        <Button disabled={page === pages - 1} onClick={() => update(page + 1)}>
          Próximas semanas
        </Button>
      </Stack>
    </Stack>
  );
}
