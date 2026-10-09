import { useProjects } from './useProjects';
import { TopicReport } from './TopicReport';
import { topicBuckets, type ReportTopic } from './topic-report-model';
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
import { ReportToolbar } from './ReportToolbar';
import { EmptyState } from './Surface';
import { RecordDrawer } from './RecordDrawer';
import { contextualRecordPath } from './routes';
import { CalendarTimeline } from './CalendarTimeline';
import { CalendarProjectFilter } from './CalendarProjectFilter';
import { updatePersonalFilters } from './calendar-project-filter';
import { date, text } from './data';
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
  byTopic: ReportTopic[];
  unassignedMinutes: number;
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
  const projects = useProjects(functions, uid, company ? 'work' : 'all');
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
    setParams(updatePersonalFilters(params, key, value));
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
          includeArchived={includeArchived}
          total={report && !loading ? hours(report.totalMinutes) : '—'}
          fromDate={firstDate}
          toDate={lastDate}
          projectId={projectId}
          projects={projects.rows.map((p) => ({
            id: p.id,
            label: label(p.id),
            searchText:
              text(p.data.title, '') + ' ' + text(p.data.description, ''),
          }))}
          onFilter={update}
          onRefresh={() => setAttempt((v) => v + 1)}
          onInfo={() => setInfoOpen((v) => !v)}
        />
      ) : (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            alignItems: 'center',
            flexWrap: 'wrap',
            minWidth: 0,
            p: { xs: 2, sm: 2.5 },
            border: 1,
            borderColor: 'divider',
            borderRadius: '12px',
            bgcolor: 'background.paper',
          }}
        >
          <Tooltip title="Período anterior">
            <IconButton
              aria-label="Período anterior"
              onClick={() => update('date', moveReference(selected, view, -1))}
            >
              <UiIcon kind="previous" />
            </IconButton>
          </Tooltip>
          <TextField
            size="small"
            type="date"
            value={selected}
            label="Referência"
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => update('date', e.target.value)}
            sx={{ width: { xs: 130, sm: 150 }, minWidth: 0 }}
          />
          <Tooltip title="Próximo período">
            <IconButton
              aria-label="Próximo período"
              onClick={() => update('date', moveReference(selected, view, 1))}
            >
              <UiIcon kind="next" />
            </IconButton>
          </Tooltip>
          <TextField
            size="small"
            select
            value={view}
            label="Visualização"
            onChange={(e) => update('view', e.target.value)}
            sx={{ width: 100 }}
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
            sx={{ width: 140 }}
          >
            {['supercompact', 'compact', 'timeline'].map((d) => (
              <MenuItem key={d} value={d}>
                {d === 'timeline'
                  ? 'Régua'
                  : d === 'compact'
                    ? 'Compacto'
                    : 'Supercompacto'}
              </MenuItem>
            ))}
          </TextField>
          <CalendarProjectFilter
            key={String(revealed)}
            projectId={projectId}
            projects={projects.rows.map((p) => ({
              id: p.id,
              label: label(p.id),
              searchText:
                text(p.data.title, '') + ' ' + text(p.data.description, ''),
            }))}
            loading={projects.loading}
            error={projects.error}
            onChange={(id) => update('projectId', id)}
          />
          <FormControlLabel
            sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12 } }}
            control={
              <Checkbox
                size="small"
                checked={includeArchived}
                onChange={(e) =>
                  update('includeArchived', String(e.target.checked))
                }
              />
            }
            label="Arquivados"
          />
          <Tooltip title="Atualizar calendário">
            <IconButton
              aria-label="Atualizar calendário"
              onClick={() => setAttempt((v) => v + 1)}
            >
              <UiIcon kind="refresh" />
            </IconButton>
          </Tooltip>
        </Stack>
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
                    Avisos detalhados ocultos na apresentação atual.
                  </Typography>
                )}
              </Stack>
            </Collapse>
            {report.intervals.length === 0 && (
              <EmptyState
                title="Nenhum registro neste escopo"
                detail="Ajuste o período ou os filtros para consultar outras atividades."
              />
            )}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md: company ? 'repeat(2,minmax(0,1fr))' : '1fr',
                },
                gap: 2,
              }}
            >
              {!calendar &&
                report.byProject.some((project) => project.minutes > 0) && (
                  <Paper sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}>
                    <Typography component="h3" variant="h6">
                      Tempo por projeto
                    </Typography>
                    <Box
                      component="svg"
                      viewBox="0 0 200 200"
                      role="img"
                      aria-label="Distribuição por projeto; valores na legenda"
                      sx={{
                        width: 160,
                        maxWidth: '100%',
                        display: 'block',
                        mx: 'auto',
                        my: 2,
                      }}
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
                      <Box
                        component="circle"
                        cx="100"
                        cy="100"
                        r="58"
                        sx={(theme) => ({
                          fill: theme.palette.background.paper,
                        })}
                      />
                    </Box>
                    <Box
                      component="ul"
                      sx={{
                        listStyle: 'none',
                        p: 0,
                        m: 0,
                        '& li': {
                          py: 1,
                          borderBottom: 1,
                          borderColor: 'divider',
                          fontSize: 14,
                        },
                      }}
                    >
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
              {company &&
                report.byUser?.some((person) => person.minutes > 0) && (
                  <Paper sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}>
                    <Typography component="h2" variant="h6">
                      Tempo por pessoa
                    </Typography>
                    <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                      {report.byUser.map((person, index) => (
                        <Box
                          component="li"
                          key={person.uid}
                          sx={{
                            py: 1.5,
                            borderBottom: 1,
                            borderColor: 'divider',
                          }}
                        >
                          {revealed ? person.label : 'Pessoa ' + (index + 1)}:{' '}
                          {hours(person.minutes)}
                          <Box
                            aria-hidden="true"
                            sx={{
                              mt: 1,
                              height: 6,
                              bgcolor: 'action.hover',
                              borderRadius: 1,
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              sx={{
                                height: '100%',
                                width:
                                  (report.totalMinutes > 0
                                    ? (person.minutes / report.totalMinutes) *
                                      100
                                    : 0) + '%',
                                bgcolor: 'primary.main',
                              }}
                            />
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Paper>
                )}
            </Box>
            {!calendar && (
              <Box sx={{ mt: 2 }}>
                <TopicReport
                  personal={!company}
                  buckets={topicBuckets(
                    report.byTopic ?? [],
                    (id) => projects.rows.find((row) => row.id === id)?.data,
                    revealed,
                    company ? undefined : uid,
                  )}
                  unassignedMinutes={report.unassignedMinutes ?? 0}
                />
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
                    xs:
                      view === 'month'
                        ? 'repeat(7,minmax(0,1fr))'
                        : 'minmax(0,1fr)',
                    sm: view === 'day' ? '1fr' : 'repeat(7,minmax(0,1fr))',
                  },
                  gap: { xs: 0.5, sm: 1 },
                  '& .MuiPaper-root': { minWidth: 0, overflow: 'hidden' },
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
                          xs: view === 'month' ? 80 : entries.length ? 80 : 44,
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
                        sx={{
                          mb: 0.5,
                          color: 'text.secondary',
                          fontSize: { xs: view === 'month' ? 11 : 14, sm: 14 },
                          whiteSpace: view === 'month' ? 'nowrap' : 'normal',
                          overflow: 'hidden',
                        }}
                      >
                        {new Intl.DateTimeFormat('pt-BR', {
                          weekday: view === 'month' ? undefined : 'short',
                          day: 'numeric',
                          month: view === 'month' ? undefined : 'short',
                          timeZone: zone,
                        }).format(new Date(day + 'T12:00:00Z'))}
                      </Typography>
                      {outside ? (
                        <Typography variant="caption">
                          Fora do mês consultado — sem cobertura
                        </Typography>
                      ) : entries.length === 0 ? (
                        <Typography
                          variant="caption"
                          sx={{
                            display: {
                              xs: view === 'month' ? 'none' : 'block',
                              sm: 'block',
                            },
                          }}
                        >
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
            {calendar && (
              <Box
                component="ul"
                aria-label="Legenda dos projetos"
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  listStyle: 'none',
                  m: 0,
                  p: 0,
                  fontSize: 12,
                }}
              >
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
          </>
        )
      )}
    </Stack>
  );
}
