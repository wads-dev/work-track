import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { httpsCallable, type Functions } from 'firebase/functions';
import type { Firestore } from 'firebase/firestore';
import {
  Link as RouterLink,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import { reportError } from './report-error';
import { date, text, useRows } from './data';
import { safeProject, usePrivacy } from './privacy';
import { hours, pieSlices } from './report-chart';
import {
  calendarDays,
  addDays,
  customRange,
  moveReference,
  dayKey,
  midnight,
  overlaps,
  range,
  validZone,
  type View,
} from './calendar-utils';
type Interval = {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt?: string;
  effectiveStartedAt: string;
  effectiveEndedAt: string;
  estimated: boolean;
  minutes: number;
};
type PersonalReport = {
  policy: string;
  budgetTimeZone: string;
  asOf: string;
  from: string;
  to: string;
  timeZone: string;
  totalMinutes: number;
  estimatedCount: number;
  byProject: { projectId: string; minutes: number }[];
  intervals: Interval[];
  warnings: string[];
  page: {
    limit: number;
    scannedCount: number;
    excludedCount: number;
    nextCursor: string | null;
    partial: boolean;
  };
};
export function PersonalPage({
  db,
  functions,
  calendar = false,
}: {
  db: Firestore;
  functions: Functions;
  calendar?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { revealed } = usePrivacy();
  const projects = useRows(db, 'projects');
  const zone = params.get('timeZone') ?? 'America/Sao_Paulo';
  const selected =
    params.get('date') ?? dayKey(new Date(), 'America/Sao_Paulo');
  const rawView = params.get('view') ?? (calendar ? 'week' : 'day');
  const cursor = params.get('cursor') ?? '';
  const firstDate = params.get('fromDate') ?? selected;
  const lastDate = params.get('toDate') ?? selected;
  let validated: ReturnType<typeof range> | null = null;
  let invalid = '';
  let view: View = 'day';
  try {
    if (!['day', 'week', 'month'].includes(rawView))
      throw new Error('Visualização inválida.');
    view = rawView as View;
    validated = calendar
      ? range(selected, view, validZone(zone))
      : customRange(firstDate, lastDate, zone);
  } catch (error) {
    invalid = error instanceof Error ? error.message : 'Filtros inválidos.';
  }
  const from = validated?.from ?? '';
  const to = validated?.to ?? '';
  const [report, setReport] = useState<PersonalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!from || !to) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setReport(null);
    void httpsCallable<
      {
        from: string;
        to: string;
        timeZone: string;
        limit: number;
        cursor?: string;
      },
      PersonalReport
    >(
      functions,
      'getPersonalReport',
    )({ from, to, timeZone: zone, limit: 200, ...(cursor ? { cursor } : {}) })
      .then((result) => {
        if (active) {
          setReport(result.data);
          setLoading(false);
        }
      })
      .catch((failure: unknown) => {
        if (active) {
          setError(reportError(failure));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [functions, from, to, zone, cursor, attempt]);
  const label = (id: string) =>
    text(
      safeProject(projects.rows.find((p) => p.id === id)?.data, revealed)
        ?.title,
    );
  const color = (id: string) =>
    ['#2457a7', '#a84417', '#35704a', '#8d4388', '#796214', '#166c77'][
      Array.from(id).reduce((n, c) => n + c.charCodeAt(0), 0) % 6
    ];
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.delete('cursor');
    setParams(next);
  }
  if (invalid)
    return (
      <Alert
        severity="error"
        action={
          <Button onClick={() => setParams({})}>Restaurar filtros</Button>
        }
      >
        {invalid}
      </Alert>
    );
  return (
    <Stack spacing={3}>
      <Typography component="h2" variant="h5">
        {calendar ? 'Calendário pessoal' : 'Dashboard pessoal'}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {calendar ? (
          <>
            <Button
              onClick={() => update('date', moveReference(selected, view, -1))}
            >
              Anterior
            </Button>
            <TextField
              type="date"
              label="Data de referência"
              value={selected}
              onChange={(e) => update('date', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              label="Visualização"
              value={view}
              onChange={(e) => update('view', e.target.value)}
            >
              {['day', 'week', 'month'].map((v) => (
                <MenuItem key={v} value={v}>
                  {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
                </MenuItem>
              ))}
            </TextField>
            <Button
              onClick={() => update('date', moveReference(selected, view, 1))}
            >
              Próximo
            </Button>
          </>
        ) : (
          <>
            <TextField
              type="date"
              label="Data inicial (inclusiva)"
              value={firstDate}
              onChange={(e) => update('fromDate', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="date"
              label="Data final (inclusiva)"
              value={lastDate}
              onChange={(e) => update('toDate', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </>
        )}
        <TextField
          label="Fuso IANA"
          value={zone}
          onChange={(e) => update('timeZone', e.target.value)}
        />
      </Stack>
      {!calendar && (
        <Typography color="text.secondary">
          Intervalo máximo de 31 dias inclusivos, com até 1 hora adicional para
          horário de verão. Consultas não são somadas automaticamente; paginação
          continua limitada aos dados examinados.
        </Typography>
      )}
      {loading ? (
        <CircularProgress aria-label="Carregando relatório pessoal" />
      ) : error ? (
        <Alert
          severity="error"
          action={
            <Button onClick={() => setAttempt((v) => v + 1)}>
              Tentar novamente
            </Button>
          }
        >
          {error}
        </Alert>
      ) : (
        report && (
          <>
            <Typography variant="h5">
              {hours(report.totalMinutes)} agregadas nesta página
            </Typography>
            <Typography color="text.secondary">
              Pode somar simultâneas; não são horas líquidas únicas. Referência{' '}
              {date(report.asOf, zone)} · {report.policy} · fuso do orçamento:{' '}
              {report.budgetTimeZone}. {report.page.scannedCount} registros
              examinados, {report.page.excludedCount} fora do período/inválidos.
            </Typography>
            {(report.page.partial || cursor || report.estimatedCount > 0) && (
              <Alert severity="warning">
                Parcial por página de até {report.page.limit} registros.{' '}
                {report.estimatedCount} estimado(s); fatos originais
                preservados.
              </Alert>
            )}
            <Typography>
              Estimativas usam orçamento global de 8 horas por pessoa/dia entre
              projetos, calculado com contexto completo antes da seleção da
              página. Fatos fechados consomem a margem sem truncamento. Totais
              exibidos continuam somente desta página.{' '}
              <Button component={RouterLink} to="/rules">
                Regras do relatório
              </Button>
            </Typography>
            {revealed
              ? report.warnings.map((warning, i) => (
                  <Alert key={i} severity="warning">
                    {warning}
                  </Alert>
                ))
              : report.warnings.length > 0 && (
                  <Alert severity="warning">
                    Há {report.warnings.length} avisos de cálculo. Conteúdo
                    oculto no modo live.
                  </Alert>
                )}
            {report.intervals.length === 0 && (
              <Alert severity="info">
                Nenhum intervalo neste período na página examinada. Outras
                páginas podem conter dados.
              </Alert>
            )}
            {!calendar && (
              <Paper sx={{ p: 3 }}>
                <Typography component="h3" variant="h6">
                  Tempo por projeto
                </Typography>
                <Box
                  component="svg"
                  viewBox="0 0 200 200"
                  role="img"
                  aria-label="Distribuição por projeto; valores na legenda"
                  sx={{ width: 240, maxWidth: '100%' }}
                >
                  <title>Tempo por projeto</title>
                  {pieSlices(
                    report.byProject.map((p) => ({
                      label: label(p.projectId),
                      minutes: p.minutes,
                    })),
                  ).map((slice, i) =>
                    slice.full ? (
                      <circle
                        key={i}
                        cx="100"
                        cy="100"
                        r="85"
                        fill={slice.color}
                      />
                    ) : (
                      <path key={i} d={slice.path} fill={slice.color} />
                    ),
                  )}
                </Box>
                <Box component="ul">
                  {report.byProject.map((p) => (
                    <li key={p.projectId}>
                      {label(p.projectId)}: {hours(p.minutes)} ·{' '}
                      {report.totalMinutes > 0
                        ? new Intl.NumberFormat('pt-BR', {
                            style: 'percent',
                            maximumFractionDigits: 1,
                          }).format(p.minutes / report.totalMinutes)
                        : '0%'}{' '}
                      do agregado desta página
                    </li>
                  ))}
                </Box>
              </Paper>
            )}
            {calendar && (
              <Box component="ul" aria-label="Legenda dos projetos">
                {report.byProject.map((p) => (
                  <li key={p.projectId}>
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        bgcolor: color(p.projectId),
                        mr: 1,
                      }}
                    />
                    {label(p.projectId)} · {hours(p.minutes)}
                  </li>
                ))}
              </Box>
            )}
            {calendar && (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: view === 'day' ? '1fr' : 'repeat(7,minmax(0,1fr))',
                  },
                  gap: 1,
                }}
              >
                {calendarDays(selected, view).map((day) => {
                  const outside =
                    day < validated!.first ||
                    day >= addDays(validated!.first, validated!.count);
                  const start = Date.parse(midnight(day, zone));
                  const end = Date.parse(
                    midnight(
                      new Date(Date.parse(day + 'T12:00:00Z') + 86400000)
                        .toISOString()
                        .slice(0, 10),
                      zone,
                    ),
                  );
                  const entries = report.intervals.filter(
                    (item) =>
                      Date.parse(item.effectiveStartedAt) < end &&
                      Date.parse(item.effectiveEndedAt) > start,
                  );
                  return (
                    <Paper
                      key={day}
                      sx={{ p: 1, minHeight: 140, opacity: outside ? 0.55 : 1 }}
                    >
                      <Typography component="h3" variant="subtitle2">
                        {day}
                      </Typography>
                      {outside ? (
                        <Typography variant="caption">
                          Fora do mês consultado — sem cobertura
                        </Typography>
                      ) : entries.length === 0 ? (
                        <Typography variant="caption">
                          Sem intervalos nesta página
                        </Typography>
                      ) : (
                        entries.map((item) => (
                          <Button
                            key={item.id}
                            component={RouterLink}
                            to={
                              '/records/' +
                              encodeURIComponent(item.id) +
                              '?returnTo=' +
                              encodeURIComponent(
                                location.pathname + location.search,
                              )
                            }
                            sx={{
                              display: 'block',
                              textAlign: 'left',
                              borderLeft: '4px solid ' + color(item.projectId),
                              my: 1,
                              width: '100%',
                            }}
                          >
                            <Typography variant="caption">
                              {label(item.projectId)}
                              <br />
                              {date(
                                new Date(
                                  Math.max(
                                    start,
                                    Date.parse(item.effectiveStartedAt),
                                  ),
                                ).toISOString(),
                                zone,
                              )}{' '}
                              —{' '}
                              {date(
                                new Date(
                                  Math.min(
                                    end,
                                    Date.parse(item.effectiveEndedAt),
                                  ),
                                ).toISOString(),
                                zone,
                              )}
                              {item.estimated ? ' · Estimado' : ''}
                              {report.intervals.some(
                                (other) =>
                                  other.id !== item.id && overlaps(item, other),
                              )
                                ? ' · Sobreposição'
                                : ''}
                            </Typography>
                          </Button>
                        ))
                      )}
                    </Paper>
                  );
                })}
              </Box>
            )}
            <Stack direction="row" spacing={2}>
              {cursor && (
                <Button
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete('cursor');
                    setParams(next);
                  }}
                >
                  Primeira página
                </Button>
              )}
              {report.page.nextCursor && (
                <Button
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('cursor', report.page.nextCursor!);
                    setParams(next);
                  }}
                >
                  Próxima página (substitui dados)
                </Button>
              )}
              <Button onClick={() => setAttempt((v) => v + 1)}>
                Atualizar
              </Button>
            </Stack>
          </>
        )
      )}
    </Stack>
  );
}
