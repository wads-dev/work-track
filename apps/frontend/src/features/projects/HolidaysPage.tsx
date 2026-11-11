import { useEffect, useRef, useState } from 'react';
import { Trash2, Repeat2, CalendarDays, MapPin } from 'lucide-react';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import {
  holidaysSchema,
  type Holiday,
} from '@work-track/core/registration/domain/business-hours';
import {
  observeHolidays,
  saveHolidays,
} from '../../data/repositories/holiday-repository';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
export function HolidaysPage({
  db,
  functions,
  uid,
}: {
  db: Firestore;
  functions: Functions;
  uid: string;
}) {
  const [original, setOriginal] = useState<{
    holidays: Holiday[];
    expectedHolidays: Holiday[] | null;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(
    () =>
      observeHolidays(
        db,
        uid,
        (value) => {
          setOriginal(value);
          setError('');
        },
        (failure) => setError(failure.message),
      ),
    [db, uid],
  );
  return (
    <section className="w-full min-w-0 space-y-5 pb-6">
      <h1 className="text-2xl font-semibold">Feriados</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Dias sem meta para todos os projetos. Sábados e domingos já são
        excluídos.
      </p>
      <details className="text-sm text-muted-foreground">
        <summary className="w-fit cursor-pointer">
          Como funciona o calendário
        </summary>
        <p className="mt-2 max-w-2xl leading-relaxed">
          Use a data completa e o tipo de repetição. Nos anuais, só mês e dia
          são considerados; 29/02 vale apenas em anos bissextos. A abrangência é
          opcional e informativa, sem efeito nas metas. Fuso America/Sao_Paulo.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
      {original ? (
        <HolidayEditor
          key={JSON.stringify(original)}
          original={original}
          functions={functions}
        />
      ) : (
        !error && <p role="status">Carregando calendário…</p>
      )}
    </section>
  );
}
function HolidayEditor({
  original,
  functions,
}: {
  original: { holidays: Holiday[]; expectedHolidays: Holiday[] | null };
  functions: Functions;
}) {
  const [rows, setRows] = useState(() =>
    original.holidays.map((holiday) => ({
      ...holiday,
      type: holiday.type ?? 'specific_date',
      scope: holiday.scope,
    })),
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const intent = useRef<{ key: string; requestId: string } | null>(null);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const holidays = holidaysSchema.parse(
        rows.map(({ date, name, type, scope }) => ({
          date,
          name,
          type,
          ...(scope ? { scope } : {}),
        })),
      );
      const key = JSON.stringify({
        holidays,
        expectedHolidays: original.expectedHolidays,
      });
      if (intent.current?.key !== key)
        intent.current = { key, requestId: crypto.randomUUID() };
      await saveHolidays(functions, {
        holidays,
        expectedHolidays: original.expectedHolidays,
        requestId: intent.current.requestId,
        reason:
          'Edição do calendário compartilhado de feriados pela interface web.',
      });
      setMessage('Feriados salvos.');
    } catch (failure) {
      setMessage(
        failure instanceof Error ? failure.message : 'Falha ao salvar.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p>Nenhum feriado cadastrado.</p>}
      <div className="divide-y divide-border border-y">
        {rows.map((row, index) => (
          <div
            key={index}
            aria-label={'Feriado ' + (index + 1)}
            className="grid min-w-0 grid-cols-[8.5rem_minmax(0,1fr)_2.25rem_2.25rem_2.25rem] items-center gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)_7rem_8rem_2.25rem] sm:gap-3"
          >
            <Input
              type="date"
              aria-label={'Data do feriado ' + (index + 1)}
              value={row.date}
              disabled={busy}
              className="min-w-0 w-full border-transparent bg-transparent px-1 shadow-none hover:border-input focus:border-input"
              onChange={(e) =>
                setRows((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, date: e.target.value } : item,
                  ),
                )
              }
            />
            <Input
              aria-label={'Nome do feriado ' + (index + 1)}
              title={row.name}
              placeholder="Nome do feriado"
              value={row.name}
              disabled={busy}
              className="min-w-0 w-full border-transparent bg-transparent px-1 shadow-none hover:border-input focus:border-input"
              onChange={(e) =>
                setRows((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, name: e.target.value } : item,
                  ),
                )
              }
            />
            <div
              className="relative flex h-9 min-w-0 items-center justify-center gap-2 rounded-md text-sm text-muted-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring sm:justify-start sm:px-2"
              title={
                row.type === 'every_year_same_date'
                  ? 'Todo ano na mesma data'
                  : 'Data específica'
              }
            >
              {row.type === 'every_year_same_date' ? (
                <Repeat2 className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="hidden truncate sm:inline" aria-hidden="true">
                {row.type === 'every_year_same_date' ? 'Anual' : 'Específica'}
              </span>
              <select
                aria-label={'Tipo do feriado ' + (index + 1)}
                value={row.type}
                disabled={busy}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) =>
                  setRows((current) =>
                    current.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            type: e.target.value as
                              'every_year_same_date' | 'specific_date',
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="specific_date">Data específica</option>
                <option value="every_year_same_date">
                  Todo ano na mesma data
                </option>
              </select>
            </div>
            <div
              className="relative flex h-9 min-w-0 items-center justify-center gap-2 rounded-md text-sm text-muted-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring sm:justify-start sm:px-2"
              title={
                'Abrangência: ' +
                (row.scope === 'federal'
                  ? 'Federal'
                  : row.scope === 'state'
                    ? 'Estadual'
                    : row.scope === 'municipal'
                      ? 'Municipal'
                      : 'Não informada')
              }
            >
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden truncate sm:inline" aria-hidden="true">
                {row.scope === 'federal'
                  ? 'Federal'
                  : row.scope === 'state'
                    ? 'Estadual'
                    : row.scope === 'municipal'
                      ? 'Municipal'
                      : 'Sem âmbito'}
              </span>
              <select
                aria-label={'Abrangência do feriado ' + (index + 1)}
                value={row.scope ?? ''}
                disabled={busy}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) =>
                  setRows((current) =>
                    current.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            scope: e.target.value
                              ? (e.target.value as
                                  'federal' | 'state' | 'municipal')
                              : undefined,
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="">Não informada</option>
                <option value="federal">Federal</option>
                <option value="state">Estadual</option>
                <option value="municipal">Municipal</option>
              </select>
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={'Remover feriado ' + (index + 1)}
              title={'Remover ' + row.name}
              className="text-muted-foreground hover:text-destructive"
              onClick={() =>
                setRows((current) => {
                  const next = [...current];
                  next.splice(index, 1);
                  return next;
                })
              }
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                date: '',
                name: '',
                type: 'specific_date' as const,
                scope: undefined,
              },
            ])
          }
        >
          Adicionar feriado
        </Button>
        <Button disabled={busy} onClick={() => void save()}>
          Salvar feriados
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
