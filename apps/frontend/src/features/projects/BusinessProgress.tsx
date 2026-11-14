import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Firestore } from 'firebase/firestore';
import {
  businessHoursSchema,
  type Holiday,
} from '@work-track/core/registration/domain/business-hours';
import {
  projectBusinessProgress,
  type BusinessProgress as Progress,
} from '@work-track/core/registration/domain/business-progress';
import { getProjectReport } from '@work-track/core/reports/application/get-project-report';
import { observeHolidays } from '../../data/repositories/holiday-repository';
import { subscribeAuthorizedReport } from '../../data/sources/authorized-report-source';
import { useCompanyPeople } from '../people/CompanyPeopleContext';
import { Switch } from '../../components/ui/switch';
export function ProgressBar({
  value,
  color = 'var(--primary)',
}: {
  value: Progress;
  color?: string;
}) {
  const people = useCompanyPeople();
  const percent = (hours: number) =>
    value.total > 0 ? (hours / value.total) * 100 : 0;
  const number = (hours: number) =>
    hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const credit = Math.max(0, value.openingBalance ?? 0);
  const debt = Math.max(0, -(value.openingBalance ?? 0));
  const creditWidth = Math.min(100, percent(credit));
  const deliveredEnd = Math.min(100, percent(value.delivered));
  // Consume overtime first, then overlay the visible tail of the delivered bar.
  const debtStart = Math.min(100, percent(Math.max(0, value.delivered - debt)));
  const debtWidth = Math.max(0, deliveredEnd - debtStart);
  return (
    <article
      className="space-y-2 rounded-xl border bg-card p-4"
      aria-label={'Progresso de ' + value.month}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">
          {value.month}
          {value.future ? ' · Previsão' : ''}
        </h3>
        <span className="text-sm tabular-nums">
          {number(value.delivered)}h / {number(value.total)}h ·{' '}
          {value.total > 0
            ? number(percent(value.delivered)) + '%'
            : 'sem meta'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {value.businessDays} dias úteis · {value.holidayDays} feriados
        cadastrados ({value.weekdayHolidays} em dias de semana) ·{' '}
        {value.contractedBusinessDays} dias com meta
      </p>
      <div
        className="relative h-7 overflow-hidden rounded-md bg-muted"
        role="img"
        aria-label={
          'Entregue ' +
          number(value.delivered) +
          ' horas; esperado até hoje ' +
          number(value.expected) +
          ' de ' +
          number(value.total) +
          ' horas' +
          (value.openingBalance !== undefined
            ? '; saldo anterior ' + number(value.openingBalance) + ' horas'
            : '')
        }
      >
        <div
          className="absolute inset-y-0 left-0 bg-foreground/15"
          style={{ width: Math.min(100, percent(value.expected)) + '%' }}
        />
        {credit > 0 && value.total > 0 && (
          <div
            data-carry="credit"
            className="absolute inset-y-1 left-0 rounded-l-sm border-r border-background bg-sky-500"
            style={{ width: creditWidth + '%' }}
            title={'Crédito anterior: +' + number(credit) + 'h'}
          />
        )}
        <div
          data-progress="delivered"
          className="absolute inset-y-1 flex overflow-hidden rounded-sm"
          style={{
            left: creditWidth + '%',
            width: Math.max(0, percent(value.delivered)) + '%',
            background: color,
          }}
        >
          {value.people.map((person) => (
            <span
              key={person.uid}
              tabIndex={0}
              className="h-full border-r border-background/60 last:border-0"
              style={{
                width:
                  value.delivered > 0
                    ? (person.hours / value.delivered) * 100 + '%'
                    : '0%',
              }}
              title={
                (people.name(person.uid) || person.label) +
                ': ' +
                number(person.hours) +
                'h · ' +
                number(percent(person.hours)) +
                '% do total do mês'
              }
              aria-label={
                (people.name(person.uid) || person.label) +
                ': ' +
                number(person.hours) +
                ' horas, ' +
                number(percent(person.hours)) +
                '% do mês'
              }
            />
          ))}
        </div>
        {debtWidth > 0 && (
          <div
            data-carry="debt"
            className="pointer-events-none absolute inset-y-1 border-l-2 border-rose-500"
            style={{
              left: debtStart + '%',
              width: debtWidth + '%',
              background:
                'repeating-linear-gradient(135deg, rgba(244,63,94,0.6) 0px, rgba(244,63,94,0.6) 5px, rgba(244,63,94,0.3) 5px, rgba(244,63,94,0.3) 10px)',
            }}
            title={'Débito anterior: −' + number(debt) + 'h'}
          />
        )}
        {value.total > 0 && (
          <span
            className="absolute inset-y-0 border-l-2 border-foreground"
            style={{ left: Math.min(99.5, percent(value.expected)) + '%' }}
          />
        )}
      </div>
      {(credit > 0 || debt > 0) && (
        <div
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
          aria-label="Legenda do saldo na barra"
        >
          <span className="inline-flex items-center gap-1">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: color }}
              aria-hidden="true"
            />
            Entregas do mês
          </span>
          {credit > 0 && (
            <span className="inline-flex items-center gap-1">
              <span
                className="size-2.5 rounded-sm bg-sky-500"
                aria-hidden="true"
              />
              Crédito anterior: +{number(credit)}h no início
            </span>
          )}
          {debt > 0 && (
            <span className="inline-flex items-center gap-1">
              <span
                className="size-2.5 rounded-sm bg-rose-500/60"
                aria-hidden="true"
              />
              Débito anterior: −{number(debt)}h sobre o final das entregas
            </span>
          )}
          {debt > value.delivered && (
            <span>
              Débito ainda não coberto: {number(debt - value.delivered)}h
            </span>
          )}
          {value.total === 0 && <span>Sem escala na barra: mês sem meta.</span>}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
        <span>
          Esperado até hoje: {number(value.expected)}h (
          {number(percent(value.expected))}%)
        </span>
        <span>
          {value.delivered >= value.expected ? 'Adiantado' : 'Faltam'}{' '}
          {number(Math.abs(value.delivered - value.expected))}h em relação à
          meta acumulada
        </span>
      </div>
      {value.openingBalance !== undefined &&
        value.closingBalance !== undefined && (
          <div className="space-y-1 border-t pt-2 text-xs tabular-nums">
            <p>
              Saldo anterior: {value.openingBalance > 0 ? '+' : ''}
              {number(value.openingBalance)}h
            </p>
            <p>
              {value.projected
                ? 'Saldo projetado após a meta mensal'
                : 'Saldo para o mês seguinte'}
              : {value.closingBalance > 0 ? '+' : ''}
              {number(value.closingBalance)}h
            </p>
            <p>
              Posição até hoje com saldo:{' '}
              {value.openingBalance + value.delivered - value.expected > 0
                ? '+'
                : ''}
              {number(value.openingBalance + value.delivered - value.expected)}h
            </p>
            <p>
              Horas restantes com saldo:{' '}
              {number(
                Math.max(
                  0,
                  value.total - value.delivered - value.openingBalance,
                ),
              )}
              h
            </p>
          </div>
        )}
      {value.total === 0 && value.delivered > 0 && (
        <p className="text-xs">
          +{number(value.delivered)}h extras em mês sem meta.
        </p>
      )}
      {value.delivered > value.total && value.total > 0 && (
        <p className="text-xs">
          +{number(value.delivered - value.total)}h acima da meta mensal.
        </p>
      )}
    </article>
  );
}
export function ProjectBusinessProgress({
  db,
  uid,
  projectId,
  project,
  hidden,
  history = false,
  controlsTarget,
}: {
  db: Firestore;
  uid: string;
  projectId: string;
  project?: Record<string, unknown>;
  hidden: boolean;
  history?: boolean;
  controlsTarget?: HTMLElement | null;
}) {
  const [source, setSource] = useState<{
    report: Awaited<ReturnType<typeof getProjectReport>>;
    holidays: Holiday[];
  } | null>(null);
  const [futureMonths, setFutureMonths] = useState(0);
  const [carryBalance, setCarryBalance] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(0);
  const configuration = JSON.stringify(project?.businessHours ?? []);
  useEffect(() => {
    const id = window.setInterval(() => setClock((v) => v + 1), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setSource(null);
    setError('');
    if (hidden) return;
    const parsed = businessHoursSchema.safeParse(JSON.parse(configuration));
    if (!parsed.success) {
      setError('Configuração de contratos inválida.');
      return;
    }
    if (!parsed.data.length) return;
    let active = true,
      generation = 0;
    let holidays: Holiday[] | null = null;
    let report: Awaited<ReturnType<typeof getProjectReport>> | null = null;
    const publish = () => {
      if (active && holidays && report) {
        setSource({ report, holidays });
        setError('');
      }
    };
    const stopHolidays = observeHolidays(
      db,
      uid,
      (value) => {
        holidays = value.holidays;
        publish();
      },
      (failure) => setError(failure.message),
    );
    const stop = subscribeAuthorizedReport(
      db,
      uid,
      (snapshot) => {
        const ticket = ++generation;
        report = null;
        setSource(null);
        void getProjectReport(
          snapshot.repository.project(),
          { projectId, limit: 200, includeArchived: true },
          Date.now(),
          uid,
        )
          .then((value) => {
            if (active && ticket === generation) {
              if (value.page.partial)
                throw new Error(
                  'Relatório incompleto; nenhum progresso parcial exibido.',
                );
              report = value;
              publish();
            }
          })
          .catch((failure) => {
            if (active && ticket === generation) setError(String(failure));
          });
      },
      (failure) => {
        report = null;
        setSource(null);
        setError(failure.message);
      },
    );
    return () => {
      active = false;
      stop();
      stopHolidays();
    };
  }, [db, uid, projectId, configuration, hidden, clock]);
  const calculation = useMemo(() => {
    if (!source) return { data: null, error: '' };
    try {
      return {
        data: projectBusinessProgress(
          source.report,
          businessHoursSchema.parse(JSON.parse(configuration)),
          source.holidays,
          new Date(),
          {
            futureMonths: history ? futureMonths : 0,
            carryBalance: history && carryBalance,
            currentOnly: !history,
          },
        ),
        error: '',
      };
    } catch (failure) {
      return { data: null, error: String(failure) };
    }
  }, [source, configuration, history, futureMonths, carryBalance, clock]);
  const data = calculation.data;
  if (hidden) return null;
  if (calculation.error) return <p role="alert">{calculation.error}</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!businessHoursSchema.safeParse(JSON.parse(configuration)).success)
    return null;
  if (configuration === '[]')
    return history ? (
      <p>
        Cadastre um período em Detalhes / Editar para ativar o acompanhamento.
      </p>
    ) : null;
  if (!data) return <p role="status">Calculando horas úteis…</p>;
  return (
    <section
      className="space-y-3"
      aria-label={history ? 'Histórico de horas úteis' : 'Horas úteis do mês'}
    >
      {history ? (
        controlsTarget ? (
          createPortal(
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-2"
              aria-label="Opções do histórico"
            >
              <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                Meses futuros
                <select
                  className="rounded-md border bg-background px-2 py-1"
                  value={futureMonths}
                  onChange={(event) =>
                    setFutureMonths(Number(event.target.value))
                  }
                >
                  {Array.from({ length: 25 }, (_, month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                <Switch
                  checked={carryBalance}
                  onCheckedChange={setCarryBalance}
                  aria-label="Transportar saldo entre meses"
                />
                Transportar saldo
              </label>
            </div>,
            controlsTarget,
          )
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Histórico{' '}
              {typeof project?.title === 'string' ? project.title : ''}
            </h2>
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-2"
              aria-label="Opções do histórico"
            >
              <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                Meses futuros
                <select
                  className="rounded-md border bg-background px-2 py-1"
                  value={futureMonths}
                  onChange={(event) =>
                    setFutureMonths(Number(event.target.value))
                  }
                >
                  {Array.from({ length: 25 }, (_, month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                <Switch
                  checked={carryBalance}
                  onCheckedChange={setCarryBalance}
                  aria-label="Transportar saldo entre meses"
                />
                Transportar saldo
              </label>
            </div>
          </div>
        )
      ) : (
        <h2 className="text-lg font-semibold">Horas úteis do mês atual</h2>
      )}
      {data.map((value) => (
        <ProgressBar
          key={value.month}
          value={value}
          color={typeof project?.color === 'string' ? project.color : undefined}
        />
      ))}
    </section>
  );
}
