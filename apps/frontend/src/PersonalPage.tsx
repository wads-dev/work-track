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
import { ReportToolbar } from './ReportToolbar';
import { RecordDrawer } from './RecordDrawer';
import { contextualRecordPath } from './routes';
import { CalendarTimeline } from './CalendarTimeline';
import { date, text, useRows } from './data';
import { safeProject, usePrivacy } from './privacy';
import { hours, pieSlices } from './report-chart';
import {
  calendarDays,
  addDays,
  customRange,
  parseDay,
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
  scope?: 'all-selected';
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
  uid,
}: {
  db: Firestore;
  functions: Functions;
  calendar?: boolean;
  company?: boolean;
  uid: string;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { revealed } = usePrivacy();
  const projects = useRows(db, 'projects');
  const zone = 'America/Sao_Paulo';
  const density =
    params.get('density') ??
    (params.get('view') === 'month' ? 'supercompact' : 'timeline');
  const selected =
    params.get('date') ?? dayKey(new Date(), 'America/Sao_Paulo');
  const rawView = params.get('view') ?? (calendar ? 'week' : 'day');
  const includeArchived = params.get('includeArchived') === 'true';
  const firstDate = params.get('fromDate') ?? '';
  const lastDate = params.get('toDate') ?? '';
  const projectId = params.get('projectId') ?? '';
  const recordId = params.get('record');
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
      : firstDate && lastDate
        ? customRange(firstDate, lastDate, zone)
        : null;
    if (firstDate) parseDay(firstDate);
    if (lastDate) parseDay(lastDate);
  } catch (error) {
    invalid = error instanceof Error ? error.message : 'Filtros inválidos.';
  }
  const from =
    validated?.from ?? (!invalid && firstDate ? midnight(firstDate, zone) : '');
  const to =
    validated?.to ??
    (!invalid && lastDate ? midnight(addDays(lastDate, 1), zone) : '');
  const [report, setReport] = useState<PersonalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (invalid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setReport(null);
    void httpsCallable<
      {
        from?: string;
        to?: string;
        projectId?: string;
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
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(projectId ? { projectId } : {}),
      timeZone: zone,
      limit: company ? 50 : 200,
      includeArchived,
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
  }, [
    functions,
    from,
    to,
    zone,
    attempt,
    includeArchived,
    company,
    projectId,
    invalid,
  ]);
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
    if (key === 'clear') {
      next.delete('fromDate');
      next.delete('toDate');
      next.delete('projectId');
    } else if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'view') {
      next.set('density', value === 'month' ? 'supercompact' : 'timeline');
    }
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
    <Stack spacing={2}>
      {recordId && (
        <RecordDrawer
          key={recordId}
          db={db}
          functions={functions}
          uid={uid}
          recordId={recordId}
          search={location.search}
          presentation="dialog"
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete('record');
            setParams(next);
          }}
        />
      )}
      {!calendar ? (
        <ReportToolbar
          total={report && !loading ? hours(report.totalMinutes) : '—'}
          fromDate={firstDate}
          toDate={lastDate}
          projectId={projectId}
          projects={projects.rows.map((p) => ({
            id: p.id,
            label: label(p.id),
          }))}
          onFilter={update}
          onRefresh={() => setAttempt((v) => v + 1)}
          onInfo={() => setInfoOpen((v) => !v)}
        />
      ) : (
        <Button onClick={() => setAttempt((v) => v + 1)}>Atualizar</Button>
      )}
      {calendar && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button
            onClick={() => update('date', moveReference(selected, view, -1))}
          >
            Anterior
          </Button>
          <TextField
            size="small"
            type="date"
            value={selected}
            label="Referência"
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => update('date', e.target.value)}
          />
          <TextField
            size="small"
            select
            value={view}
            label="Visualização"
            onChange={(e) => update('view', e.target.value)}
          >
            {['day', 'week', 'month'].map((v) => (
              <MenuItem key={v} value={v}>
                {v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : 'Dia'}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            select
            label="Densidade"
            value={density}
            onChange={(e) => update('density', e.target.value)}
          >
            {['supercompact', 'compact', 'timeline'].map((d) => (
              <MenuItem key={d} value={d}>
                {d}
              </MenuItem>
            ))}
          </TextField>
          <Button
            onClick={() => update('date', moveReference(selected, view, 1))}
          >
            Próximo
          </Button>
        </Stack>
      )}
      <FormControlLabel
        control={
          <Checkbox
            checked={includeArchived}
            onChange={(e) =>
              update('includeArchived', String(e.target.checked))
            }
          />
        }
        label="Incluir arquivados"
      />
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
            {report.page.partial && (
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
                    Avisos detalhados ocultos no modo seguro.
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
                        do agregado selecionado
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
                    xs: 'minmax(0,1fr)',
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
                        minHeight: {
                          xs: entries.length ? 80 : 44,
                          sm: density === 'supercompact' ? 88 : 116,
                        },
                        boxShadow: 'none',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
                        minWidth: 0,
                        overflow: 'hidden',
                        opacity: outside ? 0.55 : 1,
                      }}
                    >
                      <Typography
                        component="h3"
                        variant="subtitle2"
                        sx={{ mb: 0.5, color: 'text.secondary' }}
                      >
                        {new Intl.DateTimeFormat('pt-BR', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          timeZone: zone,
                        }).format(new Date(day + 'T12:00:00Z'))}
                      </Typography>
                      {outside ? (
                        <Typography variant="caption">
                          Fora do mês consultado — sem cobertura
                        </Typography>
                      ) : entries.length === 0 ? (
                        <Typography variant="caption">
                          Sem atividades
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
                              to={contextualRecordPath(
                                location.pathname,
                                location.search,
                                item.id,
                              )}
                              sx={{
                                display: 'block',
                                textAlign: 'left',
                                borderLeft:
                                  '4px solid ' + color(item.projectId),
                                my: 1,
                                width: '100%',
                                minWidth: 0,
                                maxWidth: '100%',
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
          </>
        )
      )}
    </Stack>
  );
}
