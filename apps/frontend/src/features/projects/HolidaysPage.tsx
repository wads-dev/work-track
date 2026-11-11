import { useEffect, useRef, useState } from 'react';
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
    <section className="mx-auto max-w-3xl space-y-4 rounded-xl border bg-card p-6">
      <h1 className="text-2xl font-semibold">Feriados</h1>
      <p className="text-sm text-muted-foreground">
        Calendário compartilhado de dias sem meta para todos os projetos.
        Sábados e domingos já são excluídos automaticamente. Cada feriado vale
        para a data e o ano cadastrados, no fuso America/Sao_Paulo.
      </p>
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
  const [rows, setRows] = useState(original.holidays);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const intent = useRef<{ key: string; requestId: string } | null>(null);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const holidays = holidaysSchema.parse(rows);
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
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap gap-2">
          <Input
            className="w-44"
            aria-label={'Data do feriado ' + (index + 1)}
            type="date"
            value={row.date}
            disabled={busy}
            onChange={(e) =>
              setRows((current) =>
                current.map((item, i) =>
                  i === index ? { ...item, date: e.target.value } : item,
                ),
              )
            }
          />
          <Input
            className="min-w-48 flex-1"
            aria-label={'Nome do feriado ' + (index + 1)}
            value={row.name}
            disabled={busy}
            onChange={(e) =>
              setRows((current) =>
                current.map((item, i) =>
                  i === index ? { ...item, name: e.target.value } : item,
                ),
              )
            }
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              setRows((current) => {
                const next = [...current];
                next.splice(index, 1);
                return next;
              })
            }
          >
            Remover {index + 1}
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            setRows((current) => [...current, { date: '', name: '' }])
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
