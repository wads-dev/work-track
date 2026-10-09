import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  Tooltip,
  IconButton,
  Collapse,
} from '@mui/material';
import { httpsCallable, type Functions } from 'firebase/functions';
import type { Firestore } from 'firebase/firestore';
import {
  Link as RouterLink,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import { reportError } from './report-error';
import { UiIcon } from './UiIcons';
import { CalendarTimeline } from './CalendarTimeline';
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
  byUser?: { uid: string; label: string; minutes: number }[];
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
  company = false,
}: {
  db: Firestore;
  functions: Functions;
  calendar?: boolean;
  company?: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { revealed } = usePrivacy();
  const projects = useRows(db, 'projects');
  const zone = 'America/Sao_Paulo';
  const density = params.get('density') ?? 'compact';
  const selected =
    params.get('date') ?? dayKey(new Date(), 'America/Sao_Paulo');
  const rawView = params.get('view') ?? (calendar ? 'week' : 'day');
  const cursor = params.get('cursor') ?? '';
  const includeArchived = params.get('includeArchived') === 'true';
  const firstDate = params.get('fromDate') ?? selected;
  const lastDate = params.get('toDate') ?? selected;
  let validated: ReturnType<typeof range> | null = null;
  let invalid = '';
  let view: View = 'day';
  try {
    if (!['day', 'week', 'month'].includes(rawView))
      throw new Error('Visualização inválida.');
    if (!['supercompact', 'compact', 'timeline'].includes(density))
      throw new Error('Densidade inválida.');
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
        includeArchived: boolean;
      },
      PersonalReport
    >(
      functions,
      company ? 'getCompanyReport' : 'getPersonalReport',
    )({
      from,
      to,
      timeZone: zone,
      limit: company ? 50 : 200,
      includeArchived,
      ...(cursor ? { cursor } : {}),
    })
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
  }, [functions, from, to, zone, cursor, attempt, includeArchived, company]);
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
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h5">
          {report && !loading ? hours(report.totalMinutes) : '—'}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={() => setFiltersOpen((value) => !value)}>
            Filtros
          </Button>
          <Tooltip title="Atualizar">
            <IconButton
              aria-label="Atualizar relatório"
              onClick={() => setAttempt((v) => v + 1)}
            >
              <UiIcon kind="refresh" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Detalhes do cálculo">
            <IconButton
              aria-label="Detalhes do cálculo"
              onClick={() => setInfoOpen((v) => !v)}
            >
              <UiIcon kind="detail" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Collapse in={filtersOpen || calendar}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {calendar ? (
            <>
              <Button
                onClick={() =>
                  update('date', moveReference(selected, view, -1))
                }
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
          {calendar && (
            <TextField
              select
              label="Densidade"
              value={density}
              onChange={(e) => update('density', e.target.value)}
            >
              <MenuItem value="supercompact">Supercompacto</MenuItem>
              <MenuItem value="compact">Compacto</MenuItem>
              <MenuItem value="timeline">Linha do tempo</MenuItem>
            </TextField>
          )}
        </Stack>
        <FormControlLabel
          control={
            <Checkbox
              checked={includeArchived}
              onChange={(e) =>
                update('includeArchived', String(e.target.checked))
              }
            />
          }
          label="Incluir projetos arquivados nesta consulta"
        />
      </Collapse>
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
            {(report.page.partial || cursor) && (
              <Alert severity="warning">
                Dados parciais desta página; não é total global.
              </Alert>
            )}
            <Collapse in={infoOpen}>
              <Stack spacing={1}>
                <Typography>
                  Referência {date(report.asOf, zone)} · {report.policy};{' '}
                  {report.page.scannedCount} registros examinados.{' '}
                  {report.estimatedCount} estimados. Tempos podem somar
                  atividades simultâneas.
                </Typography>
                <Button component={RouterLink} to="/rules">
                  Regras de cálculo
                </Button>
                {revealed ? (
                  report.warnings.map((warning, i) => (
                    <Alert key={i} severity="warning">
                      {warning}
                    </Alert>
                  ))
                ) : (
                  <Typography>
                    Avisos detalhados ocultos no modo live.
                  </Typography>
                )}
              </Stack>
            </Collapse>
            {report.intervals.length === 0 && (
              <Alert severity="info">
                Nenhum intervalo neste período na página examinada. Outras
                páginas podem conter dados.
              </Alert>
            )}
            {!calendar &&
              report.byProject.some((project) => project.minutes > 0) && (
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
            {company && report.byUser?.some((person) => person.minutes > 0) && (
              <Paper sx={{ p: 3 }}>
                <Typography component="h2" variant="h6">
                  Tempo por pessoa
                </Typography>
                <Box component="ul">
                  {report.byUser.map((person, index) => (
                    <li key={person.uid}>
                      {revealed ? person.label : 'Pessoa ' + (index + 1)}:{' '}
                      {hours(person.minutes)}
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
            {calendar && density === 'timeline' && (
              <CalendarTimeline
                items={report.intervals}
                day={selected}
                view={view}
                zone={zone}
                label={label}
                color={color}
                returnTo={location.pathname + location.search}
              />
            )}
            {calendar && density !== 'timeline' && (
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
                      sx={{
                        p: 1,
                        minHeight: density === 'supercompact' ? 80 : 140,
                        opacity: outside ? 0.55 : 1,
                      }}
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
                          <Tooltip
                            key={item.id}
                            title={
                              label(item.projectId) +
                              ' · ' +
                              new Intl.DateTimeFormat('pt-BR', {
                                timeZone: zone,
                                hour: '2-digit',
                                minute: '2-digit',
                              }).format(new Date(item.effectiveStartedAt)) +
                              ' — ' +
                              new Intl.DateTimeFormat('pt-BR', {
                                timeZone: zone,
                                hour: '2-digit',
                                minute: '2-digit',
                              }).format(new Date(item.effectiveEndedAt)) +
                              ' · ' +
                              new Intl.NumberFormat('pt-BR', {
                                maximumFractionDigits: 1,
                              }).format(
                                (Date.parse(item.effectiveEndedAt) -
                                  Date.parse(item.effectiveStartedAt)) /
                                  60000,
                              ) +
                              ' min'
                            }
                          >
                            <Button
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
                                borderLeft:
                                  '4px solid ' + color(item.projectId),
                                my: 1,
                                width: '100%',
                                whiteSpace:
                                  density === 'supercompact'
                                    ? 'nowrap'
                                    : 'normal',
                                py: density === 'supercompact' ? 0.25 : 1,
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  display: 'block',
                                  whiteSpace:
                                    density === 'supercompact'
                                      ? 'nowrap'
                                      : 'normal',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                <Box
                                  component="span"
                                  aria-hidden="true"
                                  sx={{
                                    display: 'inline-block',
                                    width: 6,
                                    height: 6,
                                    bgcolor: color(item.projectId),
                                    mr: 0.5,
                                    borderRadius: '50%',
                                  }}
                                />
                                {new Intl.DateTimeFormat('pt-BR', {
                                  timeZone: zone,
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }).format(
                                  new Date(
                                    Math.max(
                                      start,
                                      Date.parse(item.effectiveStartedAt),
                                    ),
                                  ),
                                )}{' '}
                                {label(item.projectId)}
                                {density !== 'supercompact' && (
                                  <>
                                    <br />
                                    {new Intl.DateTimeFormat('pt-BR', {
                                      timeZone: zone,
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }).format(
                                      new Date(
                                        Math.min(
                                          end,
                                          Date.parse(item.effectiveEndedAt),
                                        ),
                                      ),
                                    )}
                                    {item.estimated ? ' · Estimado' : ''}
                                    {report.intervals.some(
                                      (other) =>
                                        other.id !== item.id &&
                                        overlaps(item, other),
                                    )
                                      ? ' · Sobreposição'
                                      : ''}
                                  </>
                                )}
                              </Typography>
                            </Button>
                          </Tooltip>
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
