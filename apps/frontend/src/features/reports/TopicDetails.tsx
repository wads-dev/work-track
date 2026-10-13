import { ArrowLeft, ExternalLink } from 'lucide-react';
import { ProjectAppearance } from '@work-track/core/registration/domain/project-color';
import { githubUrl as githubSchema } from '@work-track/core/registration/domain/project-management';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '../../components/ui/tooltip';
import { UiIcon } from '../../shared/ui/UiIcons';
import { TopicEditor } from '../projects/TopicEditor';
import { safeProject } from '../../shared/ui/privacy';
import { getFirestore } from 'firebase/firestore';
import { getTopicReport } from '@work-track/core/reports/application/get-topic-report';
import { subscribeAuthorizedReport } from '../../data/sources/authorized-report-source';
import { LocalTopicReportRepository } from '../../data/sources/local-topic-report';
import { PersonIdentity } from '../people/PersonIdentity';
import { TableHead } from '../../components/ui/table';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { TableCell } from '../../components/ui/table';
import { TableRow } from '../../components/ui/table';
import { TableHeader } from '../../components/ui/table';
import { TableBody } from '../../components/ui/table';
import { Table } from '../../components/ui/table';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { useEffect, useState } from 'react';

import type { Functions } from 'firebase/functions';
import {
  Link as RouterLink,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useProjects } from '../projects/hooks/useProjects';
import { usePrivacy, isHidden } from '../../shared/ui/privacy';
import { objects, text, date } from '../../shared/data';
import { hours } from './report-chart';
import { safeReturnTo, topicDetailsPath } from '../../app/routes';
import {
  projectAccessRevision,
  useProjectAccessRevision,
} from '../../data/cache/project-access-revision';
import {
  deletionRevision,
  useDeletionRevision,
} from '../../data/cache/record-deletion';
import { reportError } from './report-error';
import {
  canonicalCatalogTopic,
  validateTopicReport,
  type TopicDetailReport,
} from './topic-details';
export function TopicDetails({
  functions,
  uid,
}: {
  functions: Functions;
  uid: string;
}) {
  const { projectId = '', topicId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'details' ? 'details' : 'overview';
  const location = useLocation();
  const projects = useProjects(functions, uid);
  const { revealed } = usePrivacy();
  const access = useProjectAccessRevision();
  const deletion = useDeletionRevision(uid);
  const project = projects.rows.find((p) => p.id === projectId)?.data;
  const hidden = isHidden(project, revealed);
  const canonical = canonicalCatalogTopic(objects(project?.topics), topicId);
  const [attempt, setAttempt] = useState(0);
  const identity = JSON.stringify([
    uid,
    projectId,
    topicId,
    canonical,
    project,
    hidden,
    access,
    deletion,
    attempt,
  ]);
  const [state, setState] = useState<{
    identity: string;
    data?: TopicDetailReport;
    error?: string;
  }>({ identity: '' });
  useEffect(() => {
    let active = true;
    if (
      !project ||
      hidden ||
      !canonical ||
      projects.loading ||
      !projects.complete ||
      projects.error ||
      tab !== 'overview'
    )
      return;
    setState({ identity });
    let revision = 0;
    const isCurrent = (version: number) =>
      active &&
      version === revision &&
      projectAccessRevision() === access &&
      deletionRevision(uid) === deletion;
    const stop = subscribeAuthorizedReport(
      getFirestore(functions.app),
      uid,
      (snapshot) => {
        const version = ++revision;
        if (!isCurrent(version)) return;
        setState({ identity });
        if (!snapshot.coherent) return;
        void getTopicReport(
          new LocalTopicReportRepository(snapshot.repository),
          { projectId, topicId, includeArchived: true },
          uid,
        )
          .then((result) => {
            const data = validateTopicReport(
              result,
              uid,
              projectId,
              topicId,
              canonical,
            );
            if (isCurrent(version)) setState({ identity, data });
          })
          .catch((error) => {
            if (isCurrent(version))
              setState({ identity, error: reportError(error) });
          });
      },
      (error) => {
        const version = ++revision;
        if (isCurrent(version))
          setState({ identity, error: reportError(error) });
      },
      [projectId],
    );
    return () => {
      active = false;
      stop();
    };
  }, [
    functions,
    uid,
    projectId,
    topicId,
    canonical,
    project,
    hidden,
    projects.loading,
    projects.complete,
    projects.error,
    identity,
    access,
    deletion,
    tab,
  ]);
  const current =
    state.identity === identity && projects.complete ? state : undefined;
  if (projects.loading)
    return (
      <Skeleton
        role="status"
        aria-label="Carregando tópico"
        className={cn('size-6 rounded-full')}
      />
    );
  if (projects.error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{projects.error}</AlertDescription>
      </Alert>
    );
  if (hidden)
    return (
      <Alert>
        <AlertDescription>
          Tópico reservado ou projeto indisponível. Revele o conteúdo autorizado
          para consultar detalhes.
        </AlertDescription>
      </Alert>
    );
  if (!canonical)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Tópico indisponível ou unificação inconsistente. Nenhum relatório
          alternativo foi consultado.
        </AlertDescription>
      </Alert>
    );
  const topic = objects(project?.topics).find((t) => t.id === canonical);
  const colors = projects.rows.map((p) => ({
    id: p.id,
    color: safeProject(p.data, revealed).color,
  }));
  const color = new ProjectAppearance(
    colors.find((p) => p.id === projectId) ?? { id: projectId },
  ).getColor(colors);
  const data = current?.data;
  const label = text(
    objects(project?.topics).find((t) => t.id === canonical)?.title,
    'Tópico',
  );
  return (
    <div className={cn('flex flex-col min-w-0 gap-4')}>
      <div
        aria-label="Seções do tópico e ações"
        className="flex min-w-0 flex-wrap items-center justify-between gap-3"
      >
        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = new URLSearchParams(params);
            next.set('tab', value);
            setParams(next);
          }}
        >
          <TabsList aria-label="Seções do tópico">
            <TabsTrigger
              id="topic-tab-overview"
              aria-controls="topic-panel-overview"
              value="overview"
            >
              Visão geral
            </TabsTrigger>
            <TabsTrigger
              id="topic-tab-details"
              aria-controls="topic-panel-details"
              value="details"
            >
              Detalhes / Editar
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <RouterLink
              to={
                params.has('returnTo')
                  ? safeReturnTo(params.get('returnTo'))
                  : '/projects/' +
                    encodeURIComponent(projectId) +
                    '?tab=details'
              }
            >
              <ArrowLeft aria-hidden="true" />
              Voltar
            </RouterLink>
          </Button>
          {tab === 'overview' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-9"
                  aria-label="Atualizar relatório do tópico"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  <UiIcon kind="refresh" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Atualizar relatório</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <header
        className="flex min-w-0 flex-col gap-4 rounded-xl border border-l-4 bg-card p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between"
        style={{ borderLeftColor: color }}
      >
        <div className="min-w-0 space-y-2">
          <RouterLink
            to={'/projects/' + encodeURIComponent(projectId) + '?tab=details'}
            className="text-sm text-muted-foreground hover:underline"
          >
            {text(project?.title, 'Projeto')}
          </RouterLink>
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {label}
          </h1>
          <p className="max-w-4xl whitespace-pre-line text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {text(topic?.description, 'Sem descrição.')}
          </p>
          {githubSchema.safeParse(topic?.githubUrl).success ? (
            <a
              href={String(topic?.githubUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-2 text-sm text-primary hover:underline [overflow-wrap:anywhere]"
            >
              <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              {String(topic?.githubUrl).replace('https://github.com/', '')}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              GitHub não associado · disponível em Detalhes / Editar
            </p>
          )}
        </div>
        {tab === 'overview' && data && (
          <div className="shrink-0">
            <p className="text-xs text-muted-foreground">Tempo atribuído</p>
            <p className="text-3xl font-semibold tabular-nums">
              {hours(data.totalMinutes)}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.occurrenceCount} registros
            </p>
          </div>
        )}
      </header>
      {tab === 'details' && topic && (
        <section
          role="tabpanel"
          id="topic-panel-details"
          aria-labelledby="topic-tab-details"
        >
          <TopicEditor
            key={projectId + canonical + String(revealed)}
            functions={functions}
            projectId={projectId}
            topicId={canonical}
            topic={topic}
            disabled={
              project?.archived === true ||
              !!project?.mergedInto ||
              !!project?.mergeLock
            }
          />
        </section>
      )}
      {tab === 'overview' && (
        <section
          role="tabpanel"
          id="topic-panel-overview"
          aria-labelledby="topic-tab-overview"
          className="space-y-4"
        >
          {topicId !== canonical && (
            <Alert>
              <AlertDescription>
                Este tópico foi unificado. Os fatos abaixo pertencem ao tópico
                canônico{' '}
                <RouterLink
                  to={topicDetailsPath(projectId, canonical) + location.search}
                  className={cn(
                    'text-primary underline-offset-4 hover:underline',
                  )}
                >
                  {label}
                </RouterLink>
                .
              </AlertDescription>
            </Alert>
          )}
          {current?.error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {current.error}
                <div className="mt-2">
                  <Button
                    onClick={() => setAttempt((n) => n + 1)}
                    variant="ghost"
                  >
                    Tentar novamente
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : !data ? (
            <Skeleton
              role="status"
              aria-label="Carregando relatório do tópico"
              className={cn('size-6 rounded-full')}
            />
          ) : (
            <>
              <Card className="gap-0 p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Primeiro registro
                    </p>
                    <p className="text-sm">
                      {data.firstRecordStartedAt
                        ? date(data.firstRecordStartedAt)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Último registro
                    </p>
                    <p className="text-sm">
                      {data.lastRecordStartedAt
                        ? date(data.lastRecordStartedAt)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Encerrado</p>
                    <p className="text-lg font-semibold">
                      {hours(data.closedMinutes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Estimativa aberta
                    </p>
                    <p className="text-lg font-semibold">
                      {hours(data.estimatedMinutes)}
                    </p>
                  </div>
                </div>
                {data.occurrenceCount === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Nenhum registro encontrado para este tópico.
                  </p>
                )}
              </Card>
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer py-2">
                  Sobre o cálculo
                  {data.warnings.length > 0
                    ? ' · ' + data.warnings.length + ' notas'
                    : ''}
                </summary>
                <div className="space-y-2 pt-2">
                  <p>
                    Intervalos completos: {hours(data.fullRecordMinutes)} · Sem
                    divisão informada: {hours(data.unassignedMinutes)} ·{' '}
                    {data.intervals.length} intervalos computáveis.
                  </p>
                  <p>
                    As datas são inícios reais dos registros, inclusive sem
                    duração computável. Ocorrências não são horas; nenhuma
                    divisão proporcional é inventada. Estimativas abertas não
                    representam encerramento.
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {data.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </details>
              <Card className={cn('gap-0 p-6 min-w-0')}>
                <h2 className={cn('text-lg font-semibold')}>Participantes</h2>
                <div className={cn('overflow-x-auto rounded-xl border')}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {[
                          'Pessoa',
                          'Registros',
                          'Primeiro início',
                          'Último início',
                          'Atribuído',
                          'Encerrado',
                          'Estimativa aberta',
                        ].map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.participants.map((p) => (
                        <TableRow key={p.uid}>
                          <TableCell>
                            <PersonIdentity
                              uid={hidden ? undefined : p.uid}
                              fallback={p.label || 'Pessoa'}
                            />
                          </TableCell>
                          <TableCell>{p.occurrenceCount}</TableCell>
                          <TableCell>
                            {p.firstRecordStartedAt
                              ? date(p.firstRecordStartedAt)
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {p.lastRecordStartedAt
                              ? date(p.lastRecordStartedAt)
                              : '—'}
                          </TableCell>
                          <TableCell>{hours(p.assignedMinutes)}</TableCell>
                          <TableCell>{hours(p.closedMinutes)}</TableCell>
                          <TableCell>{hours(p.estimatedMinutes)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {data.participants.length === 0 && (
                  <p className={cn('text-base')}>
                    Sem participantes com registros.
                  </p>
                )}
              </Card>
            </>
          )}
        </section>
      )}
    </div>
  );
}
