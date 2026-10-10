import { cn } from './lib/utils';
import { Button } from './components/ui/button';
import { Alert, AlertDescription } from './components/ui/alert';

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
      <Alert>
        <AlertDescription>
          Nenhuma semana com atividade para os filtros selecionados.
        </AlertDescription>
      </Alert>
    );
  return (
    <div className={cn('flex flex-col gap-4')}>
      <p className={cn('text-sm')}>
        Todas as semanas com atividade · {weeks.length} semanas · página{' '}
        {page + 1} de {pages}. Apenas semanas com atividade são exibidas; totais
        abrangem todo o histórico autorizado.
      </p>
      {weeks.slice(page * 4, page * 4 + 4).map((week) => (
        <div key={week} className={cn('flex flex-col gap-2')}>
          <h2 className={cn('text-lg font-semibold')}>
            Semana de {week} a {addDays(week, 6)}
          </h2>
          <p className={cn('text-sm')}>
            {occurrences.find((o) => o.week === week)?.occurrenceCount ?? 0}{' '}
            registros iniciados nesta semana. Registros sem duração computável
            não somam horas; abertos aparecem como marcadores de início.
          </p>
          <CalendarTimeline {...props} day={week} view="week" />
        </div>
      ))}
      <div className={cn('flex flex-row gap-2')}>
        <Button
          disabled={page === 0}
          onClick={() => update(page - 1)}
          variant="ghost"
        >
          Semanas anteriores
        </Button>
        <Button
          disabled={page === pages - 1}
          onClick={() => update(page + 1)}
          variant="ghost"
        >
          Próximas semanas
        </Button>
      </div>
    </div>
  );
}
