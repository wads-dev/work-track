import { useRef, useState } from 'react';
import type { Functions } from 'firebase/functions';
import {
  businessHoursSchema,
  type BusinessHoursPeriod,
} from '@work-track/core/registration/domain/business-hours';
import { projectMutation } from '../../infrastructure/firebase/project-mutation';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Alert } from '../../components/ui/alert';

export function ProjectBusinessHours({
  functions,
  projectId,
  project,
}: {
  functions: Functions;
  projectId: string;
  project: Record<string, unknown>;
}) {
  const original = businessHoursSchema.safeParse(project.businessHours ?? []);
  const [rows, setRows] = useState<BusinessHoursPeriod[]>(() =>
    original.success ? original.data : [],
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const intent = useRef<{ key: string; requestId: string } | null>(null);
  const disabled =
    busy ||
    !original.success ||
    Boolean(project.archived || project.mergeLock || project.mergedInto);
  const change = (index: number, patch: Partial<BusinessHoursPeriod>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  async function save() {
    if (disabled || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      const businessHours = businessHoursSchema.parse(rows);
      const expectedBusinessHours =
        project.businessHours === undefined
          ? null
          : businessHoursSchema.parse(project.businessHours);
      const key = JSON.stringify({ businessHours, expectedBusinessHours });
      if (intent.current?.key !== key)
        intent.current = { key, requestId: crypto.randomUUID() };
      await projectMutation(
        functions,
        'updateProject',
      )({
        projectId,
        businessHours,
        expectedBusinessHours,
        requestId: intent.current.requestId,
        reason: 'Edição de contratação de horas úteis pela interface web.',
      });
      intent.current = null;
      setMessage('Contratos salvos.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border p-4"
      aria-label="Contratação de horas úteis"
    >
      <h2 className="font-semibold">Horas por dia útil</h2>
      <p className="text-sm text-muted-foreground">
        Ative o acompanhamento cadastrando um período. Início e fim inclusivos;
        fim vazio mantém a vigência. Sábados, domingos e feriados não têm meta.
        A carga é do projeto inteiro, não por pessoa.
      </p>
      {!original.success && (
        <Alert role="alert">
          Histórico inválido no armazenamento. Não é seguro sobrescrever.
        </Alert>
      )}
      {rows.length === 0 && (
        <p className="text-sm">Sem contrato: acompanhamento desativado.</p>
      )}
      {rows.map((row, index) => (
        <div key={index} className="grid items-end gap-3 sm:grid-cols-4">
          <label className="text-sm">
            Início
            <Input
              aria-label={'Início do contrato ' + (index + 1)}
              type="date"
              value={row.startDate}
              disabled={disabled}
              onChange={(e) => change(index, { startDate: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Fim (opcional)
            <Input
              aria-label={'Fim do contrato ' + (index + 1)}
              type="date"
              value={row.endDate ?? ''}
              disabled={disabled}
              onChange={(e) =>
                change(index, { endDate: e.target.value || null })
              }
            />
          </label>
          <label className="text-sm">
            Horas/dia útil
            <Input
              aria-label={'Horas por dia do contrato ' + (index + 1)}
              type="number"
              min="0"
              max="24"
              step="0.25"
              value={Number.isNaN(row.hoursPerDay) ? '' : row.hoursPerDay}
              disabled={disabled}
              onChange={(e) =>
                change(index, {
                  hoursPerDay:
                    e.target.value === '' ? NaN : Number(e.target.value),
                })
              }
            />
          </label>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() =>
              setRows((current) => {
                const next = [...current];
                next.splice(index, 1);
                return next;
              })
            }
          >
            Remover período {index + 1}
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() =>
            setRows((current) => [
              ...current,
              { startDate: '', endDate: null, hoursPerDay: 8 },
            ])
          }
        >
          Adicionar período
        </Button>
        <Button disabled={disabled} onClick={() => void save()}>
          {busy ? 'Salvando…' : 'Salvar contratos'}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
