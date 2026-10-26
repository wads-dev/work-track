import { useRef, useState } from 'react';
import type { Functions } from 'firebase/functions';
import {
  timeMultipliersSchema,
  type TimeMultipliers,
} from '@work-track/core/registration/domain/time-multipliers';
import { projectMutation } from '../../infrastructure/firebase/project-mutation';
import { useCompanyPeople } from '../people/CompanyPeopleContext';
import { PersonIdentity } from '../people/PersonIdentity';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Alert } from '../../components/ui/alert';

type Row = { userId: string; multiplier: string; effectiveFrom: string };
export function parseMultiplierRows(rows: Row[]): TimeMultipliers {
  const result: Record<
    string,
    { multiplier: number; effectiveFrom: string | null }[]
  > = Object.create(null);
  for (const row of rows) {
    if (!row.multiplier.trim()) throw new Error('Informe um fator numérico.');
    (result[row.userId] ??= []).push({
      multiplier: Number(row.multiplier),
      effectiveFrom: row.effectiveFrom.trim() || null,
    });
  }
  return timeMultipliersSchema.parse(result);
}
export function ProjectTimeMultipliers({
  functions,
  projectId,
  project,
}: {
  functions: Functions;
  projectId: string;
  project: Record<string, unknown>;
}) {
  const directory = useCompanyPeople();
  const original = timeMultipliersSchema.safeParse(
    project.timeMultipliers === undefined ? {} : project.timeMultipliers,
  );
  const [rows, setRows] = useState<Row[]>(() =>
    original.success
      ? Object.entries(original.data).flatMap(([userId, history]) =>
          history.map((rule) => ({
            userId,
            multiplier: String(rule.multiplier),
            effectiveFrom: rule.effectiveFrom ?? '',
          })),
        )
      : [],
  );
  const [userId, setUserId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const intent = useRef<{ key: string; requestId: string } | null>(null);
  const disabled =
    busy ||
    !original.success ||
    Boolean(project.archived || project.mergeLock || project.mergedInto);
  async function save() {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      const timeMultipliers = parseMultiplierRows(rows);
      const expectedTimeMultipliers =
        project.timeMultipliers === undefined
          ? null
          : timeMultipliersSchema.parse(project.timeMultipliers);
      const key = JSON.stringify({ timeMultipliers, expectedTimeMultipliers });
      if (intent.current?.key !== key)
        intent.current = { key, requestId: crypto.randomUUID() };
      await projectMutation(
        functions,
        'updateProject',
      )({
        projectId,
        timeMultipliers,
        expectedTimeMultipliers,
        requestId: intent.current.requestId,
        reason: 'Edição de multiplicadores pela interface web.',
      });
      intent.current = null;
      setMessage('Multiplicadores salvos.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Falha ao salvar multiplicadores.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Multiplicadores de tempo"
      className="space-y-3 rounded-xl border p-4"
    >
      <h3 className="text-lg font-semibold">
        Multiplicadores de tempo por pessoa
      </h3>
      <p>
        O fator é escolhido pelo início original do registro, nunca pelo recorte
        do relatório. Sem regra aplicável, o fator é 1. Uma vigência vazia é a
        base atemporal (null); uma regra datada substitui essa base.
      </p>
      <p>
        Use datas ISO com fuso explícito, por exemplo 2026-01-01T00:00:00-03:00.
        Fatores finitos maiores ou iguais a zero; cada instante e a base devem
        ser únicos por pessoa.
      </p>
      <p className="text-sm text-muted-foreground">
        O fator do início vale até o fim do registro, mesmo se ele atravessar
        outra vigência. Editar ou remover regras antigas recalcula os relatórios
        históricos; para mudanças futuras, adicione uma nova vigência.
      </p>
      {directory.loading && <p role="status">Carregando pessoas…</p>}
      {directory.error && (
        <Alert>
          {directory.error}
          <Button onClick={directory.refresh}>Tentar novamente</Button>
        </Alert>
      )}
      {!directory.loading &&
        !directory.error &&
        directory.people.length === 0 && <p>Nenhuma pessoa no diretório.</p>}
      {!original.success && (
        <Alert variant="destructive">
          Configuração inválida armazenada. Corrija os dados antes de editar.
        </Alert>
      )}
      {message && <Alert role="status">{message}</Alert>}
      <fieldset disabled={disabled} className="space-y-3">
        <label>
          Pessoa{' '}
          <select
            aria-label="Pessoa para multiplicador"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">Escolha uma pessoa</option>
            {directory.people.map((person) => (
              <option key={person.uid} value={person.uid}>
                {directory.name(person.uid) ?? person.uid} ({person.uid})
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          disabled={!userId}
          onClick={() =>
            setRows([...rows, { userId, multiplier: '1', effectiveFrom: '' }])
          }
        >
          Adicionar regra
        </Button>
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <PersonIdentity uid={row.userId} />
            <label>
              Fator{' '}
              <Input
                aria-label={'Fator ' + (index + 1)}
                type="number"
                min="0"
                step="any"
                value={row.multiplier}
                onChange={(event) =>
                  setRows(
                    rows.map((item, i) =>
                      i === index
                        ? { ...item, multiplier: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
            <label>
              Vigência (vazio = base){' '}
              <Input
                aria-label={'Vigência ' + (index + 1)}
                placeholder="2026-01-01T00:00:00-03:00"
                value={row.effectiveFrom}
                onChange={(event) =>
                  setRows(
                    rows.map((item, i) =>
                      i === index
                        ? { ...item, effectiveFrom: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
            <Button
              type="button"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              Remover regra {index + 1}
            </Button>
          </div>
        ))}
        <Button type="button" onClick={() => void save()}>
          Salvar multiplicadores
        </Button>
      </fieldset>
    </section>
  );
}
