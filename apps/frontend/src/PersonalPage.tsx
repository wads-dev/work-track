import { cn } from './lib/utils';
import { Button } from './components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from './components/ui/tooltip';
import { Label } from './components/ui/label';
import { Input } from './components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './components/ui/select';
import { Checkbox } from './components/ui/checkbox';
import { Alert, AlertDescription } from './components/ui/alert';
import { Card } from './components/ui/card';
import { Skeleton } from './components/ui/skeleton';
import { MetadataLink, metadataNavigation } from './MetadataLink';
import { InteractiveChart } from './InteractiveChart';
import {
  useProjectAccessRevision,
  projectAccessRevision,
} from './project-access-revision';
import { QueryToolbar, QueryToolbarField } from './QueryToolbar';
import { CalendarHistory } from './CalendarHistory';
import { calendarTopics, updateCalendarFilters } from './calendar-history';
import {
  calendarPerson,
  calendarRequest,
  updateCalendarPerson,
  calendarReport,
  type CalendarResponse,
} from './calendar-people';
import { useProjects } from './useProjects';
import { TopicReport } from './TopicReport';
import { topicBuckets, type ReportTopic } from './topic-report-model';
import { useEffect, useState } from 'react';
import { useDeletionRevision, deletionRevision } from './record-deletion';

import type { Functions } from 'firebase/functions';
import { executePersonalReport } from '../../backend/src/modules/reports/application/get-personal-report';
import { executeCalendarReport } from '../../backend/src/modules/reports/application/get-calendar-report';
import { calendarInput } from '../../backend/src/modules/reports/application/calendar-input';
import {
  subscribeAuthorizedReport,
  type AuthorizedReportSnapshot,
} from './authorized-report-source';
import { executeCompanyReport } from '../../backend/src/modules/reports/application/get-company-report';
import type { Firestore } from 'firebase/firestore';
import {
  Link as RouterLink,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import { reportError } from './report-error';
import { reportRepositoryMatches } from './report-repository-fence';
import { UiIcon } from './UiIcons';
import { ReportToolbar } from './ReportToolbar';
import { EmptyState } from './Surface';
import { RecordDrawer } from './RecordDrawer';
import { contextualRecordPath } from './routes';
import { CalendarTimeline } from './CalendarTimeline';
import { CalendarProjectFilter } from './CalendarProjectFilter';
import { updatePersonalFilters } from './calendar-project-filter';
import { date, text } from './data';
import { isHidden, safeProject, usePrivacy } from './privacy';
import { hours } from './report-chart';
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
  uid?: string;
  readOnly?: boolean;
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
  allWeeks?: boolean;
  occupiedWeeks?: string[];
  weekOccurrences?: { week: string; occurrenceCount: number }[];
  participantsUnavailable?: boolean;
  participants?: { uid: string; label: string }[];
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
  profile = false,
  uid,
}: {
  db: Firestore;
  functions: Functions;
  calendar?: boolean;
  company?: boolean;
  profile?: boolean;
  uid: string;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const person = calendarPerson(params, uid);
  useEffect(() => {
    if (calendar && !params.get('uid'))
      setParams(updateCalendarPerson(params, uid), { replace: true });
  }, [calendar, params, uid, setParams]);
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
  const allWeeks = calendar && params.get('allWeeks') === 'true';
  const subject = calendar ? params.get('subject') || '' : '';
  const topics = calendarTopics(
    projects.rows.find((p) => p.id === projectId)?.data,
    revealed,
    includeArchived,
  );
  const privacyBlocked =
    calendar &&
    person.mode === 'global' &&
    !!projectId &&
    (!projects.rows.some((p) => p.id === projectId) ||
      isHidden(projects.rows.find((p) => p.id === projectId)?.data, revealed));
  let validated: ReturnType<typeof range> | null = null;
  let invalid = '';
  let view: View = 'day';
  try {
    if (!['day', 'week', 'month'].includes(rawView))
      throw new Error('Visualização inválida.');
    if (!['supercompact', 'compact', 'timeline'].includes(density))
      throw new Error('Densidade inválida.');
    view = rawView as View;
    if (allWeeks && !projectId)
      throw new Error(
        'Selecione um projeto para consultar todas as semanas com atividade.',
      );
    if (subject && (!projectId || !topics.some((t) => t.id === subject)))
      throw new Error('Selecione um tópico disponível no projeto escolhido.');
    validated =
      calendar && !allWeeks
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
  const revision = useDeletionRevision(uid);
  const accessRevision = useProjectAccessRevision();
  const [reportAccessRevision, setReportAccessRevision] = useState(-1);
  const [reportOwner, setReportOwner] = useState('');
  const [directory, setDirectory] = useState<{
    owner: string;
    partition: string;
    unavailable: boolean;
    revision: number;
    rows: { uid: string; label: string }[];
  }>({ owner: '', partition: '', unavailable: false, revision: -1, rows: [] });
  const directoryPartition = JSON.stringify([
    projectId,
    includeArchived,
    zone,
    calendar,
    subject,
    allWeeks,
  ]);
  const participants =
    directory.owner === uid &&
    directory.revision === accessRevision &&
    directory.partition === directoryPartition &&
    !privacyBlocked
      ? directory.rows
      : [];
  const [reportQuery, setReportQuery] = useState('');
  const queryIdentity = JSON.stringify([
    calendar,
    company,
    from,
    to,
    zone,
    projectId,
    includeArchived,
    calendar ? person.selected : '',
    allWeeks,
    subject,
    view,
    selected,
    density,
  ]);
  const [reportRevision, setReportRevision] = useState(-1);
  const [cachedReport, setReport] = useState<PersonalReport | null>(null);
  const [reportRepository, setReportRepository] = useState<
    AuthorizedReportSnapshot['repository'] | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [localSnapshot, setLocalSnapshot] = useState<{
    owner: string;
    revision: number;
    query: string;
    snapshot: AuthorizedReportSnapshot;
  } | null>(null);
  const [localError, setLocalError] = useState('');
  const authorizedProjectIdsKey = JSON.stringify(
    [
      ...new Set([
        ...projects.rows.map((p) => p.id),
        ...(projectId ? [projectId] : []),
      ]),
    ].sort(),
  );
  useEffect(() => {
    setLocalSnapshot(null);
    setLocalError('');
    if (privacyBlocked || invalid) return;
    if (projects.loading) return;
    if (projects.error) {
      setLocalError(projects.error);
      return;
    }
    return subscribeAuthorizedReport(
      db,
      uid,
      (snapshot) => {
        setLocalSnapshot({
          owner: uid,
          revision: accessRevision,
          query: JSON.stringify([
            from,
            to,
            projectId,
            allWeeks,
            authorizedProjectIdsKey,
          ]),
          snapshot,
        });
      },
      (failure) => {
        setLocalSnapshot(null);
        setLocalError(reportError(failure));
      },
      JSON.parse(authorizedProjectIdsKey) as string[],
      calendar && !allWeeks && from && to ? { from, to, projectId } : undefined,
    );
  }, [
    db,
    uid,
    calendar,
    company,
    accessRevision,
    attempt,
    privacyBlocked,
    Boolean(invalid),
    person.mode,
    projects.loading,
    projects.error,
    authorizedProjectIdsKey,
    from,
    to,
    projectId,
    allWeeks,
  ]);
  const local =
    !projects.loading &&
    !projects.error &&
    localSnapshot?.owner === uid &&
    localSnapshot.revision === accessRevision &&
    localSnapshot.query ===
      JSON.stringify([from, to, projectId, allWeeks, authorizedProjectIdsKey])
      ? localSnapshot.snapshot
      : null;
  const localRepository = local?.repository;
  const report =
    !privacyBlocked &&
    reportRevision === revision &&
    reportOwner === uid &&
    reportQuery === queryIdentity &&
    reportAccessRevision === accessRevision &&
    reportRepositoryMatches(true, localRepository, reportRepository)
      ? cachedReport
      : null;
  useEffect(() => {
    let active = true;
    if (invalid || privacyBlocked) {
      setReport(null);
      setError(
        privacyBlocked
          ? 'Revele o projeto selecionado ou escolha um projeto disponível para consultar outras pessoas.'
          : '',
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setReport(null);
    if (!localRepository) {
      setError(localError);
      setLoading(!localError);
      return;
    }
    const request =
      !calendar && !company
        ? executePersonalReport(
            localRepository.calendar().own,
            {
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
              ...(projectId ? { projectId } : {}),
              timeZone: zone,
              includeArchived,
            },
            uid,
          ).then((data) => ({ data: data as PersonalReport }))
        : calendar
          ? executeCalendarReport(
              (
                localRepository as AuthorizedReportSnapshot['repository']
              ).calendar(),
              calendarInput.parse(
                calendarRequest(params, uid, from, to, zone, includeArchived),
              ),
              uid,
            ).then((data) => ({
              data: calendarReport(
                data as CalendarResponse,
                uid,
                person.mode,
                allWeeks,
              ),
            }))
          : executeCompanyReport(
              localRepository as AuthorizedReportSnapshot['repository'],
              {
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
                ...(projectId ? { projectId } : {}),
                timeZone: zone,
                limit: 50,
                includeArchived,
              },
            ).then((data) => ({ data: data as PersonalReport }));
    void request
      .then((result) => {
        if (active) {
          if (
            deletionRevision(uid) !== revision ||
            projectAccessRevision() !== accessRevision
          )
            return;
          setReportAccessRevision(accessRevision);
          setReportOwner(uid);
          setReportQuery(queryIdentity);
          setReportRevision(revision);
          setReportRepository(localRepository);
          setReport(result.data);
          if (calendar)
            setDirectory({
              owner: uid,
              partition: directoryPartition,
              unavailable: result.data.participantsUnavailable === true,
              revision: accessRevision,
              rows: result.data.participants ?? [],
            });
          setLoading(false);
        }
      })
      .catch((failure: unknown) => {
        if (
          active &&
          deletionRevision(uid) === revision &&
          projectAccessRevision() === accessRevision
        ) {
          setError(reportError(failure));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [
    localRepository,
    localError,
    functions,
    from,
    to,
    zone,
    attempt,
    revision,
    accessRevision,
    uid,
    includeArchived,
    company,
    calendar,
    person.mode,
    person.selected,
    queryIdentity,
    directoryPartition,
    privacyBlocked,
    projectId,
    invalid,
  ]);
  const label = (id: string) =>
    text(
      safeProject(projects.rows.find((p) => p.id === id)?.data, revealed)
        ?.title,
    );
  const projectLink = (id: string) => (
    <MetadataLink
      projectId={id}
      project={projects.rows.find((p) => p.id === id)?.data}
      revealed={revealed}
    />
  );
  const color = (id: string) =>
    ['#2457a7', '#a84417', '#35704a', '#8d4388', '#796214', '#166c77'][
      Array.from(id).reduce((n, c) => n + c.charCodeAt(0), 0) % 6
    ];
  function update(key: string, value: string) {
    const next = calendar
      ? updateCalendarFilters(params, key, value)
      : updatePersonalFilters(params, key, value);
    if (calendar && key === 'clear') next.set('uid', uid);
    next.delete('record');
    setParams(next);
  }
  if (invalid)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {invalid}
          <div className="mt-2">
            <Button onClick={() => setParams({})} variant="ghost">
              Restaurar filtros
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  return (
    <div className={cn('flex flex-col gap-4')}>
      {recordId && (
        <RecordDrawer
          key={uid + recordId}
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
        <QueryToolbar
          label="Filtros do calendário"
          actions={
            <>
              {' '}
              <Label className={cn('m-0 text-xs flex items-center gap-2')}>
                <Checkbox
                  aria-label="Incluir arquivados"
                  checked={includeArchived}
                  onCheckedChange={(checked) =>
                    update('includeArchived', String(checked === true))
                  }
                />
                {'Arquivados'}
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Atualizar calendário"
                    onClick={() => setAttempt((v) => v + 1)}
                    variant="ghost"
                    size="icon"
                    className={cn('shrink-0', 'size-9')}
                  >
                    <UiIcon kind="refresh" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{'Atualizar calendário'}</TooltipContent>
              </Tooltip>
            </>
          }
          secondary={
            <QueryToolbarField>
              <Label className="flex min-w-0 flex-col items-stretch gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {'Densidade'}
                </span>
                <Select
                  disabled={allWeeks}
                  value={density || '__all__'}
                  onValueChange={(value) =>
                    update('density', value === '__all__' ? '' : value)
                  }
                >
                  <SelectTrigger aria-label={'Densidade'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['supercompact', 'compact', 'timeline'].map((d) => (
                      <SelectItem key={d} value={d}>
                        {d === 'timeline'
                          ? 'Régua'
                          : d === 'compact'
                            ? 'Compacto'
                            : 'Supercompacto'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>
            </QueryToolbarField>
          }
        >
          <div
            className={cn(
              'flex items-center gap-2 w-full sm:w-auto [&_[data-query-field]]:w-40',
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={allWeeks}
                  aria-label="Período anterior"
                  onClick={() =>
                    update('date', moveReference(selected, view, -1))
                  }
                  variant="ghost"
                  size="icon"
                  className={cn('shrink-0', 'size-9')}
                >
                  <UiIcon kind="previous" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{'Período anterior'}</TooltipContent>
            </Tooltip>
            <QueryToolbarField kind="date">
              <Label className="flex min-w-0 flex-col items-stretch gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {'Referência'}
                </span>
                <Input
                  aria-label={'Referência'}
                  type="date"
                  value={selected}
                  disabled={allWeeks}
                  onChange={(e) => update('date', e.target.value)}
                />
              </Label>
            </QueryToolbarField>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={allWeeks}
                  aria-label="Próximo período"
                  onClick={() =>
                    update('date', moveReference(selected, view, 1))
                  }
                  variant="ghost"
                  size="icon"
                  className={cn('shrink-0', 'size-9')}
                >
                  <UiIcon kind="next" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{'Próximo período'}</TooltipContent>
            </Tooltip>
          </div>
          <QueryToolbarField>
            <Label className="flex min-w-0 flex-col items-stretch gap-1.5">
              <span className="text-xs text-muted-foreground">
                {'Visualização'}
              </span>
              <Select
                disabled={allWeeks}
                value={view || '__all__'}
                onValueChange={(value) =>
                  update('view', value === '__all__' ? '' : value)
                }
              >
                <SelectTrigger aria-label={'Visualização'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['day', 'week', 'month'].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : 'Dia'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
          </QueryToolbarField>
          <QueryToolbarField>
            <Label className="flex min-w-0 flex-col items-stretch gap-1.5">
              <span className="text-xs text-muted-foreground">{'Pessoa'}</span>
              <Select
                disabled={loading || profile}
                value={person.selected || '__all__'}
                onValueChange={(value) =>
                  setParams(
                    updateCalendarPerson(
                      params,
                      value === '__all__' ? '' : value,
                    ),
                  )
                }
              >
                <SelectTrigger aria-label={'Pessoa'} className={cn('min-h-11')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={uid}>Meu calendário</SelectItem>
                  {participants.length > 0 && !directory.unavailable && (
                    <SelectItem value="all">
                      Todas as pessoas · até 10
                    </SelectItem>
                  )}
                  {participants
                    .filter((p) => p.uid !== uid)
                    .map((p) => (
                      <SelectItem key={p.uid} value={p.uid}>
                        {p.label || 'Pessoa da organização'}
                      </SelectItem>
                    ))}
                  {person.selected !== uid &&
                    person.selected !== 'all' &&
                    !participants.some((p) => p.uid === person.selected) && (
                      <SelectItem value={person.selected}>
                        Pessoa selecionada · projetos globais
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
            </Label>
          </QueryToolbarField>
          <QueryToolbarField>
            <Label className="flex min-w-0 flex-col items-stretch gap-1.5">
              <span className="text-xs text-muted-foreground">{'Período'}</span>
              <Select
                value={allWeeks ? 'all' : 'dated'}
                onValueChange={(value) =>
                  update(
                    'allWeeks',
                    value === '__all__' ? '' : value === 'all' ? 'true' : '',
                  )
                }
              >
                <SelectTrigger aria-label={'Período'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dated">Período com data</SelectItem>
                  <SelectItem value="all" disabled={!projectId}>
                    Todas as semanas com atividade
                  </SelectItem>
                </SelectContent>
              </Select>
            </Label>
          </QueryToolbarField>
          <QueryToolbarField kind="project">
            <CalendarProjectFilter
              key={String(revealed)}
              projectId={projectId}
              projects={projects.rows
                .filter(
                  (p) =>
                    person.mode !== 'global' ||
                    (!isHidden(p.data, revealed) &&
                      (!p.data.type || p.data.type === 'work')),
                )
                .map((p) => ({
                  id: p.id,
                  label: label(p.id),
                  searchText:
                    text(p.data.title, '') + ' ' + text(p.data.description, ''),
                }))}
              loading={projects.loading}
              error={projects.error}
              onChange={(id) => update('projectId', id)}
            />
          </QueryToolbarField>
          {projectId && (
            <QueryToolbarField>
              <Label className="flex min-w-0 flex-col items-stretch gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {'Tópico'}
                </span>
                <Select
                  value={subject || '__all__'}
                  onValueChange={(value) =>
                    update('subject', value === '__all__' ? '' : value)
                  }
                >
                  <SelectTrigger aria-label={'Tópico'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os tópicos</SelectItem>
                    {topics.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>
            </QueryToolbarField>
          )}
        </QueryToolbar>
      )}
      {calendar &&
        directory.unavailable &&
        directory.partition === directoryPartition &&
        directory.owner === uid &&
        directory.revision === accessRevision && (
          <Alert className={cn('border-amber-500/50')}>
            <AlertDescription>
              {person.mode === 'own'
                ? 'Lista de outras pessoas indisponível na leitura direta atual. Seu calendário usa seus registros; o diretório de participantes precisa de uma fonte autorizada pelas Rules.'
                : 'Lista de pessoas indisponível para este escopo. Escolha um projeto para reduzir a consulta.'}
            </AlertDescription>
          </Alert>
        )}
      {calendar && subject && (
        <Alert>
          <AlertDescription>
            Tópico:{' '}
            <MetadataLink
              projectId={projectId}
              project={projects.rows.find((p) => p.id === projectId)?.data}
              revealed={revealed}
              topicId={subject}
            />{' '}
            . As horas e barras representam os intervalos completos dos
            registros que contêm este tópico, não uma divisão proporcional entre
            tópicos.
          </AlertDescription>
        </Alert>
      )}
      {calendar && (
        <p className={cn('text-sm')}>
          {person.mode === 'own'
            ? 'Meu calendário'
            : person.selected === 'all'
              ? 'Todas as pessoas · organização'
              : 'Calendário de ' +
                (participants.find((p) => p.uid === person.selected)?.label ||
                  'pessoa selecionada')}{' '}
          ·{' '}
          {person.mode === 'own'
            ? 'Meus registros pessoais e globais'
            : 'Somente projetos globais autorizados, nunca registros pessoais de outras pessoas'}
        </p>
      )}
      {local &&
        (!local.coherent || local.fromCache || local.hasPendingWrites) && (
          <Alert role="status">
            <AlertDescription>
              Dados locais provisórios; sincronizando com o Firestore. Os totais
              podem mudar após a confirmação do servidor.
            </AlertDescription>
          </Alert>
        )}
      {loading ? (
        <Skeleton
          role="status"
          aria-label="Carregando relatório pessoal"
          className={cn('size-6 rounded-full')}
        />
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {calendar &&
              person.mode === 'global' &&
              ' Escolha uma pessoa ou um projeto se a seleção ultrapassar 10 pessoas; não exibimos totais parciais.'}
            <div className="mt-2">
              <Button onClick={() => setAttempt((v) => v + 1)} variant="ghost">
                Tentar novamente
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        report && (
          <>
            {report.page.partial && (
              <Alert className={cn('border-amber-500/50')}>
                <AlertDescription>
                  Dados parciais desta página; não é total global.
                </AlertDescription>
              </Alert>
            )}
            <div hidden={!infoOpen}>
              <div className={cn('flex flex-col gap-2')}>
                <p className={cn('text-base')}>
                  Referência {date(report.asOf, zone)} · {report.policy};{' '}
                  {report.page.scannedCount} registros examinados.{' '}
                  {report.estimatedCount} estimados. Tempos podem somar
                  atividades simultâneas.
                </p>
                <Button asChild variant="ghost">
                  <RouterLink to={'/rules'}>Regras de cálculo</RouterLink>
                </Button>
                {revealed ? (
                  report.warnings.map((warning, i) => (
                    <Alert key={i} className={cn('border-amber-500/50')}>
                      <AlertDescription>{warning}</AlertDescription>
                    </Alert>
                  ))
                ) : (
                  <p className={cn('text-base')}>
                    Avisos detalhados ocultos na apresentação atual.
                  </p>
                )}
              </div>
            </div>
            {report.intervals.length === 0 && (
              <EmptyState
                title="Nenhum registro neste escopo"
                detail="Ajuste o período ou os filtros para consultar outras atividades."
              />
            )}
            <div
              className={cn(
                'grid grid-cols-1 gap-4',
                company && 'md:grid-cols-2',
              )}
            >
              {(!calendar || profile) &&
                report.byProject.some((project) => project.minutes > 0) && (
                  <Card className={cn('gap-0 p-4 sm:p-5 min-w-0')}>
                    <h3 className={cn('text-lg font-semibold')}>
                      Tempo por projeto
                    </h3>
                    <InteractiveChart
                      title="Tempo por projeto"
                      variant="pie"
                      data={report.byProject.map((project) => {
                        const navigation = metadataNavigation(
                          project.projectId,
                          projects.rows.find(
                            (row) => row.id === project.projectId,
                          )?.data,
                          revealed,
                        );
                        return {
                          key: project.projectId,
                          label: navigation.label,
                          minutes: project.minutes,
                          href: navigation.path
                            ? navigation.path +
                              '?returnTo=' +
                              encodeURIComponent(
                                location.pathname + location.search,
                              )
                            : undefined,
                        };
                      })}
                    />
                    <ul
                      className={cn(
                        'list-none p-0 m-0 [&_li]:py-2 [&_li]:border-b [&_li]:text-sm',
                      )}
                    >
                      {report.byProject.map((p) => (
                        <li key={p.projectId}>
                          {projectLink(p.projectId)}: {hours(p.minutes)} ·{' '}
                          {report.totalMinutes > 0
                            ? new Intl.NumberFormat('pt-BR', {
                                style: 'percent',
                                maximumFractionDigits: 1,
                              }).format(p.minutes / report.totalMinutes)
                            : '0%'}{' '}
                          do agregado selecionado
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              {company &&
                report.byUser?.some((person) => person.minutes > 0) && (
                  <Card className={cn('gap-0 p-4 sm:p-5 min-w-0')}>
                    <h2 className={cn('text-lg font-semibold')}>
                      Tempo por pessoa
                    </h2>
                    <InteractiveChart
                      title="Tempo por pessoa"
                      variant="bar"
                      data={report.byUser.map((person, index) => ({
                        key: person.uid,
                        label: revealed
                          ? person.label
                          : 'Pessoa ' + (index + 1),
                        minutes: person.minutes,
                        href:
                          revealed && person.uid
                            ? '/people/' +
                              encodeURIComponent(person.uid) +
                              location.search
                            : undefined,
                      }))}
                    />
                    <ul className={cn('list-none p-0 m-0')}>
                      {report.byUser.map((person, index) => (
                        <li key={person.uid} className={cn('py-3 border-b')}>
                          {revealed ? person.label : 'Pessoa ' + (index + 1)}:{' '}
                          {hours(person.minutes)}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
            </div>
            {!calendar && (
              <div className={cn('mt-4')}>
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
              </div>
            )}
            {calendar && allWeeks && (
              <CalendarHistory
                weeks={report.occupiedWeeks ?? []}
                occurrences={report.weekOccurrences ?? []}
                items={report.intervals}
                zone={zone}
                label={label}
                renderProject={projectLink}
                color={color}
                viewerUid={uid}
                authorLabel={(id) =>
                  participants.find((p) => p.uid === id)?.label ||
                  'Pessoa da organização'
                }
                returnTo={location.pathname + location.search}
              />
            )}
            {calendar && !allWeeks && density === 'timeline' && (
              <CalendarTimeline
                items={report.intervals}
                day={selected}
                view={view}
                zone={zone}
                label={label}
                renderProject={projectLink}
                color={color}
                viewerUid={uid}
                authorLabel={(id) =>
                  participants.find((p) => p.uid === id)?.label ||
                  'Pessoa da organização'
                }
                returnTo={location.pathname + location.search}
              />
            )}
            {calendar && !allWeeks && density !== 'timeline' && (
              <div
                className={cn(
                  'grid gap-1 sm:gap-2 [&>*]:min-w-0 [&>*]:overflow-hidden',
                  view === 'month' ? 'grid-cols-7' : 'grid-cols-1',
                  view === 'day' ? 'sm:grid-cols-1' : 'sm:grid-cols-7',
                )}
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
                    <Card
                      key={day}
                      className={cn(
                        'p-2 shadow-none border rounded-lg min-w-0 overflow-hidden',
                        view === 'month' || entries.length
                          ? 'min-h-20'
                          : 'min-h-11',
                        density === 'supercompact'
                          ? 'sm:min-h-[88px]'
                          : 'sm:min-h-[116px]',
                        outside && 'opacity-55',
                      )}
                    >
                      <h3
                        className={cn(
                          'text-sm font-medium mb-1 text-muted-foreground overflow-hidden sm:text-sm',
                          view === 'month'
                            ? 'text-[11px] whitespace-nowrap'
                            : 'text-sm whitespace-normal',
                        )}
                      >
                        {new Intl.DateTimeFormat('pt-BR', {
                          weekday: view === 'month' ? undefined : 'short',
                          day: 'numeric',
                          month: view === 'month' ? undefined : 'short',
                          timeZone: zone,
                        }).format(new Date(day + 'T12:00:00Z'))}
                      </h3>
                      {outside ? (
                        <span className={cn('text-xs')}>
                          Fora do mês consultado — sem cobertura
                        </span>
                      ) : entries.length === 0 ? (
                        <span
                          className={cn(
                            'text-xs sm:block',
                            view === 'month' ? 'hidden' : 'block',
                          )}
                        >
                          Sem atividades
                        </span>
                      ) : (
                        entries.map((item) => (
                          <div key={JSON.stringify([item.uid || uid, item.id])}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  tabIndex={0}
                                  asChild
                                  variant="ghost"
                                  className={cn(
                                    'block text-left border-l-4 my-2 w-full min-w-0 max-w-full h-auto',
                                    density === 'supercompact'
                                      ? 'whitespace-nowrap py-0.5'
                                      : 'whitespace-normal py-2',
                                  )}
                                  style={{
                                    borderLeftColor: color(item.projectId),
                                  }}
                                >
                                  {item.uid && item.uid !== uid ? (
                                    <span tabIndex={0}>
                                      <span
                                        className={cn(
                                          'text-xs block overflow-hidden text-ellipsis',
                                          density === 'supercompact'
                                            ? 'whitespace-nowrap'
                                            : 'whitespace-normal',
                                        )}
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={cn(
                                            'inline-block size-1.5 mr-1 rounded-full',
                                          )}
                                          style={{
                                            backgroundColor: color(
                                              item.projectId,
                                            ),
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
                                              Date.parse(
                                                item.effectiveStartedAt,
                                              ),
                                            ),
                                          ),
                                        )}{' '}
                                        {item.uid &&
                                          (participants.find(
                                            (p) => p.uid === item.uid,
                                          )?.label || 'Pessoa da organização') +
                                            ' · '}
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
                                                  Date.parse(
                                                    item.effectiveEndedAt,
                                                  ),
                                                ),
                                              ),
                                            )}
                                            {item.estimated
                                              ? ' · Estimado'
                                              : ''}
                                            {report.intervals.some(
                                              (other) =>
                                                other.id !== item.id &&
                                                overlaps(item, other),
                                            )
                                              ? ' · Sobreposição'
                                              : ''}
                                          </>
                                        )}
                                      </span>
                                    </span>
                                  ) : (
                                    <RouterLink
                                      to={
                                        contextualRecordPath(
                                          location.pathname,
                                          location.search,
                                          item.id,
                                        ) ?? '#'
                                      }
                                    >
                                      <span
                                        className={cn(
                                          'text-xs block overflow-hidden text-ellipsis',
                                          density === 'supercompact'
                                            ? 'whitespace-nowrap'
                                            : 'whitespace-normal',
                                        )}
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={cn(
                                            'inline-block size-1.5 mr-1 rounded-full',
                                          )}
                                          style={{
                                            backgroundColor: color(
                                              item.projectId,
                                            ),
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
                                              Date.parse(
                                                item.effectiveStartedAt,
                                              ),
                                            ),
                                          ),
                                        )}{' '}
                                        {item.uid &&
                                          (participants.find(
                                            (p) => p.uid === item.uid,
                                          )?.label || 'Pessoa da organização') +
                                            ' · '}
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
                                                  Date.parse(
                                                    item.effectiveEndedAt,
                                                  ),
                                                ),
                                              ),
                                            )}
                                            {item.estimated
                                              ? ' · Estimado'
                                              : ''}
                                            {report.intervals.some(
                                              (other) =>
                                                other.id !== item.id &&
                                                overlaps(item, other),
                                            )
                                              ? ' · Sobreposição'
                                              : ''}
                                          </>
                                        )}
                                      </span>
                                    </RouterLink>
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {label(item.projectId) +
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
                                  ' min'}
                              </TooltipContent>
                            </Tooltip>
                            <span className={cn('text-xs block px-2')}>
                              {projectLink(item.projectId)}
                            </span>
                          </div>
                        ))
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
            {calendar && (
              <ul
                aria-label="Legenda dos projetos"
                className={cn('flex flex-wrap gap-4 list-none m-0 p-0 text-xs')}
              >
                {report.byProject.map((p) => (
                  <li key={p.projectId}>
                    <span
                      aria-hidden="true"
                      className={cn('inline-block size-3 mr-2')}
                      style={{ backgroundColor: color(p.projectId) }}
                    />
                    {projectLink(p.projectId)} · {hours(p.minutes)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )
      )}
    </div>
  );
}
