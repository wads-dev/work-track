import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';

import { useSearchParams } from 'react-router-dom';
import { CalendarTimeline } from './CalendarTimeline';
import { addDays } from './calendar-utils';
import { selectCalendarHistoryPage } from '../../data/repositories/derived-report-repository';
export function CalendarHistory({
  weeks,
  occurrences,
  ...props
}: {
  weeks: string[];
  occurrences: { week: string; occurrenceCount: number }[];
} & Omit<Parameters<typeof CalendarTimeline>[0], 'day' | 'view'>) {
  const [params, setParams] = useSearchParams();
  const {
    page,
    pages,
    totalWeeks,
    weeks: visibleWeeks,
  } = selectCalendarHistoryPage(
    weeks,
    occurrences,
    Number(params.get('historyPage') || 0),
  );
  const update = (value: number) => {
    const next = new URLSearchParams(params);
    next.set('historyPage', String(value));
    setParams(next);
  };
  if (!totalWeeks)
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
        Todas as semanas com atividade · {totalWeeks} semanas · página{' '}
        {page + 1} de {pages}. Apenas semanas com atividade são exibidas; totais
        abrangem todo o histórico autorizado.
      </p>
      {visibleWeeks.map(({ week, occurrenceCount }) => (
        <div key={week} className={cn('flex flex-col gap-2')}>
          <h2 className={cn('text-lg font-semibold')}>
            Semana de {week} a {addDays(week, 6)}
          </h2>
          <p className={cn('text-sm')}>
            {occurrenceCount} registros iniciados nesta semana. Registros sem
            duração computável não somam horas; abertos aparecem como marcadores
            de início.
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
