import { createPortal } from 'react-dom';
import { PersonIdentity } from '../people/PersonIdentity';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { TableCell } from '../../components/ui/table';
import { TableHead } from '../../components/ui/table';
import { TableRow } from '../../components/ui/table';
import { TableHeader } from '../../components/ui/table';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '../../components/ui/tooltip';
import { TableBody } from '../../components/ui/table';
import { Table } from '../../components/ui/table';
import {
  useProjectAccessRevision,
  projectAccessRevision,
} from '../../data/cache/project-access-revision';
import { useEffect, useState } from 'react';
import {
  useDeletionRevision,
  deletionRevision,
} from '../../data/cache/record-deletion';

import type { Functions } from 'firebase/functions';
import { subscribeAuthorizedReport } from '../../data/sources/authorized-report-source';
import type { Firestore } from 'firebase/firestore';
import { useProjects } from '../projects/hooks/useProjects';
import { getProjectReport } from '@work-track/core/reports/application/get-project-report';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { reportError } from './report-error';
import { TopicReport } from './TopicReport';
import { date } from '../../shared/data';
import { detailPath } from '../../app/routes';
import { UiIcon } from '../../shared/ui/UiIcons';

import { hours } from './report-chart';
import { InteractiveChart } from './InteractiveChart';
export type Report =
  import('@work-track/core/reports/domain/project-report').ProjectReport;

export function ProjectReport({
  functions,
  db,
  personal = false,
  hidden,
  projectLabel = 'Projeto',
  projectId,
  search,
  uid,
  refreshKey = 0,
  summaryTarget,
  onLoadingChange,
}: {
  functions: Functions;
  db: Firestore;
  personal?: boolean;
  hidden: boolean;
  projectLabel?: string;
  projectId: string;
  search: string;
  uid: string;
  refreshKey?: number;
  summaryTarget?: HTMLElement | null;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [params, setParams] = useSearchParams();
  const includeArchived = params.get('includeArchived') === 'true';
  const revision = useDeletionRevision(uid);
  const accessRevision = useProjectAccessRevision();
  const projects = useProjects(functions, uid, 'all');
  const authorizedProjectIdsKey = JSON.stringify(
    [...new Set([...projects.rows.map((p) => p.id), projectId])].sort(),
  );
  const [reportAccessRevision, setReportAccessRevision] = useState(-1);
  const [reportOwner, setReportOwner] = useState('');
  const [reportRevision, setReportRevision] = useState(-1);
  const [cachedReport, setReport] = useState<Report | null>(null);
  const query = JSON.stringify([projectId, includeArchived]);
  const [reportQuery, setReportQuery] = useState('');
  const report =
    reportQuery === query &&
    !projects.loading &&
    projects.complete &&
    !projects.error &&
    reportRevision === revision &&
    reportOwner === uid &&
    reportAccessRevision === accessRevision
      ? cachedReport
      : null;
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [provisional, setProvisional] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (projects.error) {
      setError(projects.error);
      setLoading(false);
      return;
    }
    if (projects.loading || !projects.complete) return;
    let generation = 0;
    const stop = subscribeAuthorizedReport(
      db,
      uid,
      (snapshot) => {
        const current = ++generation;
        setLoading(true);
        void getProjectReport(
          snapshot.repository.project(),
          { projectId, limit: 200, includeArchived },
          Date.now(),
          uid,
        )
          .then((result) => {
            if (
              !active ||
              current !== generation ||
              deletionRevision(uid) !== revision ||
              projectAccessRevision() !== accessRevision
            )
              return;
            setReportAccessRevision(accessRevision);
            setReportOwner(uid);
            setReportRevision(revision);
            setReportQuery(query);
            setReport(result);
            setProvisional(
              !snapshot.coherent ||
                snapshot.fromCache ||
                snapshot.hasPendingWrites,
            );
            setError('');
            setLoading(false);
          })
          .catch((failure) => {
            if (!active || current !== generation) return;
            setReport(null);
            setError(reportError(failure));
            setLoading(false);
          });
      },
      (failure) => {
        if (!active) return;
        generation++;
        setReport(null);
        setError(reportError(failure));
        setLoading(false);
      },
      JSON.parse(authorizedProjectIdsKey) as string[],
    );
    return () => {
      active = false;
      generation++;
      stop();
    };
  }, [
    db,
    personal,
    projects.loading,
    projects.complete,
    projects.error,
    authorizedProjectIdsKey,
    functions,
    projectId,
    attempt,
    refreshKey,
    includeArchived,
    revision,
    uid,
    accessRevision,
    query,
  ]);
  if (loading && !report) return null;
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}
          {!includeArchived && !hidden && (
            <Button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('includeArchived', 'true');

                setParams(next);
              }}
              variant="ghost"
            >
              Consultar histórico de projeto arquivado
            </Button>
          )}
          <div className="mt-2">
            <Button
              onClick={() => {
                if (projects.error) projects.retry();
                setAttempt((value) => value + 1);
              }}
              variant="ghost"
            >
              Tentar novamente
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  if (!report) return null;
  // Presentation joins between the prepared report aggregates and record rows.
  const personLabels = new Map(
    report.byUser.map((person) => [person.uid, person.label]),
  );
  const topicLabels = new Map(
    (report.byTopic ?? []).map((topic) => [topic.topicId, topic.label]),
  );
  if (hidden)
    return (
      <Alert className={cn('mt-4')}>
        <AlertDescription>
          Relatório, tópicos e avisos ocultos na apresentação atual. Revele
          dados no topo para visualizar. Esta ofuscação não altera permissões de
          acesso.
        </AlertDescription>
      </Alert>
    );
  return (
    <section aria-label="Relatório do projeto" className="space-y-4">
      {provisional && (
        <Alert role="status">
          <AlertDescription>
            Dados locais provisórios; sincronizando com o Firestore. Os totais
            podem mudar após confirmação do servidor.
          </AlertDescription>
        </Alert>
      )}
      {summaryTarget
        ? createPortal(
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  Tempo registrado
                </p>
                <h2 className="text-3xl font-semibold tracking-tight tabular-nums">
                  {hours(report.totalMinutes)}
                </h2>
              </div>
              <Button
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('includeArchived', String(!includeArchived));
                  setParams(next);
                }}
                variant="outline"
                size="sm"
                aria-pressed={includeArchived}
                className="self-start sm:self-auto"
              >
                <UiIcon kind="archive" />
                {includeArchived
                  ? 'Histórico arquivado incluído'
                  : 'Incluir histórico arquivado'}
              </Button>
            </div>,
            summaryTarget,
          )
        : null}
      {report.page.partial && (
        <Alert className={cn('mb-4 border-amber-500/50')}>
          <AlertDescription>
            Relatório parcial
            {report.estimatedCount > 0
              ? ' com ' + report.estimatedCount + ' registro(s) estimado(s)'
              : ''}
            . Totais e gráficos representam somente esta página de até{' '}
            {report.page.limit}registros, não todo o projeto.
          </AlertDescription>
        </Alert>
      )}
      {report.records.length === 0 ? (
        <Alert>
          <AlertDescription>
            Nenhum registro disponível nesta página.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div
            className={cn(
              'grid grid-cols-1 md:grid-cols-2 gap-4 my-6 [&>*]:min-w-0',
            )}
          >
            <Card className="p-5 min-w-0">
              <h3 className="text-lg font-semibold">Tempo por pessoa</h3>
              <InteractiveChart
                title="Tempo por pessoa"
                variant="pie"
                data={report.byUser.map((person) => ({
                  key: person.uid,
                  uid: person.uid,
                  label: person.label,
                  minutes: person.minutes,
                  href: '/people/' + encodeURIComponent(person.uid) + search,
                }))}
              />
            </Card>
            <TopicReport
              compact
              unassignedMinutes={report.unassignedMinutes ?? 0}
              buckets={(report.byTopic ?? []).map((topic) => ({
                projectId: topic.projectId,
                topicId: topic.topicId,
                detailsAvailable: !hidden,
                projectLabel: hidden ? 'Projeto reservado' : projectLabel,
                topicLabel: hidden
                  ? 'Tópico reservado'
                  : topic.label || 'Tópico',
                minutes: topic.minutes,
                people: (topic.byUser ?? []).map((person, index) => ({
                  key: String(index),
                  uid: person.uid,
                  label: person.label || 'Pessoa',
                  minutes: person.minutes,
                })),
              }))}
            />
          </div>
          <details className="my-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer py-2">
              Sobre o cálculo
              {report.warnings.length > 0
                ? ' · ' + report.warnings.length + ' notas'
                : ''}
            </summary>
            <div className="space-y-2 pt-2 leading-relaxed">
              <p>
                Pode somar atividades simultâneas; não representa tempo líquido
                único. Referência: {date(report.asOf)}. Política:{' '}
                {report.policy}.
              </p>
              <p>
                Estimativas não alteram fatos: até agora, limitadas a 6 horas
                por registro aberto, sem teto diário, com os cortes por
                meia-noite e próximo início no mesmo projeto. Fatos fechados não
                são truncados; o total exibido considera todos os registros
                selecionados.
              </p>
              <RouterLink
                to="/rules"
                className="inline-block text-primary underline-offset-4 hover:underline"
              >
                Consultar regras e limites do relatório
              </RouterLink>
              {report.warnings.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {report.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          </details>
          <div className={cn('flex flex-col flex sm:hidden gap-2')}>
            {report.records.map((record) => (
              <Card key={record.id + record.uid} className={cn('gap-0 p-4')}>
                <p className={cn('text-lg font-semibold')}>
                  <PersonIdentity
                    uid={hidden ? undefined : record.uid}
                    fallback={personLabels.get(record.uid) || 'Pessoa'}
                  />
                </p>
                <p className={cn('text-sm text-muted-foreground')}>
                  {date(record.startedAt)} —{' '}
                  {date(record.endedAt ?? record.effectiveEndedAt)}
                </p>
                <p className={cn('text-base mt-2')}>
                  {hours(record.minutes)}{' '}
                  {record.estimated
                    ? '· Estimado; fim original não informado'
                    : '· Factual'}
                </p>
                {record.uid === uid && (
                  <Button asChild variant="ghost">
                    <RouterLink to={detailPath('records', record.id, search)}>
                      Detalhes
                    </RouterLink>
                  </Button>
                )}
              </Card>
            ))}
          </div>
          <div
            tabIndex={0}
            aria-label="Registros resumidos do projeto"
            className={cn('hidden sm:block overflow-x-auto rounded-xl border')}
          >
            <Table className={cn('min-w-[650px]')}>
              <caption className="sr-only">Registros do projeto</caption>
              <TableHeader>
                <TableRow>
                  {['Pessoa', 'Tópicos', 'Início', 'Fim', 'Tempo'].map(
                    (label) => (
                      <TableHead key={label} scope="col">
                        {label}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.records.map((record) => (
                  <TableRow key={record.id + record.uid}>
                    <TableCell>
                      <PersonIdentity
                        uid={hidden ? undefined : record.uid}
                        fallback={personLabels.get(record.uid) || 'Pessoa'}
                      />
                      {record.uid === uid && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              aria-label="Abrir detalhes do meu registro"
                              asChild
                              variant="ghost"
                              size="icon"
                              className={cn('shrink-0', 'size-9')}
                            >
                              <RouterLink
                                to={detailPath('records', record.id, search)}
                                aria-label={'Abrir detalhes do meu registro'}
                              >
                                <UiIcon kind="detail" />
                              </RouterLink>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {'Abrir detalhes do meu registro'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.topics
                        .map(
                          (topic) =>
                            topicLabels.get(topic.topicId) ?? topic.topicId,
                        )
                        .join(', ') || 'Não distribuído'}
                    </TableCell>
                    <TableCell>{date(record.startedAt)}</TableCell>
                    <TableCell>
                      {date(record.endedAt ?? record.effectiveEndedAt)}
                      {record.estimated && (
                        <span className={cn('text-xs block')}>
                          Estimado; fim original não informado
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{hours(record.minutes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
