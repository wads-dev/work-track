import { cn } from './lib/utils';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Alert, AlertDescription } from './components/ui/alert';
import { TableCell } from './components/ui/table';
import { TableHead } from './components/ui/table';
import { TableRow } from './components/ui/table';
import { TableHeader } from './components/ui/table';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from './components/ui/tooltip';
import { TableBody } from './components/ui/table';
import { Table } from './components/ui/table';
import { Skeleton } from './components/ui/skeleton';
import {
  useProjectAccessRevision,
  projectAccessRevision,
} from './project-access-revision';
import { useEffect, useState } from 'react';
import { useDeletionRevision, deletionRevision } from './record-deletion';

import { httpsCallable, type Functions } from 'firebase/functions';
import type { Firestore } from 'firebase/firestore';
import { subscribePersonalReport } from './personal-report-source';
import { personalProjectReportRepository } from './personal-project-report-repository';
import { getProjectReport } from '../../backend/src/modules/reports/application/get-project-report';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { reportError } from './report-error';
import { TopicReport } from './TopicReport';
import type { ReportTopic } from './topic-report-model';
import { date } from './data';
import { detailPath } from './routes';
import { UiIcon } from './UiIcons';

import { hours, type Bucket } from './report-chart';
import { InteractiveChart } from './InteractiveChart';
export type Report = {
  projectId: string;
  asOf: string;
  policy: string;
  budgetTimeZone: string;
  totalMinutes: number;
  byUser: (Bucket & { uid: string })[];
  byTopic: ReportTopic[];
  unassignedMinutes: number;
  records: {
    id: string;
    uid: string;
    projectId: string;
    startedAt: string;
    endedAt?: string;
    effectiveEndedAt: string;
    estimated: boolean;
    minutes: number;
    topics: { topicId: string; minutes: number }[];
  }[];
  estimatedCount: number;
  warnings: string[];
  page: { limit: number; nextCursor: string | null; partial: boolean };
};

export function ProjectReport({
  functions,
  db,
  personal = false,
  hidden,
  projectLabel = 'Projeto',
  projectId,
  search,
  uid,
}: {
  functions: Functions;
  db: Firestore;
  personal?: boolean;
  hidden: boolean;
  projectLabel?: string;
  projectId: string;
  search: string;
  uid: string;
}) {
  const [params, setParams] = useSearchParams();
  const includeArchived = params.get('includeArchived') === 'true';
  const revision = useDeletionRevision(uid);
  const accessRevision = useProjectAccessRevision();
  const [reportAccessRevision, setReportAccessRevision] = useState(-1);
  const [reportOwner, setReportOwner] = useState('');
  const [reportRevision, setReportRevision] = useState(-1);
  const [cachedReport, setReport] = useState<Report | null>(null);
  const report =
    reportRevision === revision &&
    reportOwner === uid &&
    reportAccessRevision === accessRevision
      ? cachedReport
      : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [provisional, setProvisional] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setReport(null);
    if (personal) {
      let generation = 0;
      const stop = subscribePersonalReport(
        db,
        uid,
        (snapshot) => {
          const current = ++generation;
          setReport(null);
          setLoading(true);
          void getProjectReport(
            personalProjectReportRepository(snapshot.repository, uid),
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
              setReport(result);
              setProvisional(snapshot.fromCache || snapshot.hasPendingWrites);
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
        [projectId],
      );
      return () => {
        active = false;
        generation++;
        stop();
      };
    }
    setProvisional(false);
    const callable = httpsCallable<
      {
        projectId: string;
        limit: number;
        cursor?: string;
        includeArchived: boolean;
      },
      Report
    >(functions, 'getProjectReport');
    void callable({
      projectId,
      limit: 200,
      includeArchived,
    })
      .then((result) => {
        if (active) {
          if (
            deletionRevision(uid) !== revision ||
            projectAccessRevision() !== accessRevision
          )
            return;
          setReportAccessRevision(accessRevision);
          setReportOwner(uid);
          setReportRevision(revision);
          setReport(result.data);
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
    db,
    personal,
    functions,
    projectId,
    attempt,
    includeArchived,
    revision,
    uid,
    accessRevision,
  ]);
  if (loading)
    return (
      <div role="status" className={cn('flex flex-row gap-4')}>
        <Skeleton role="status" className={cn('size-6 rounded-full')} />
        <p className={cn('text-base')}>Carregando relatório do projeto…</p>
      </div>
    );
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
              onClick={() => setAttempt((value) => value + 1)}
              variant="ghost"
            >
              Tentar novamente
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  if (!report) return null;
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
    <section aria-label="Relatório do projeto" className={cn('mt-6')}>
      {provisional && (
        <Alert role="status">
          <AlertDescription>
            Dados locais provisórios; sincronizando com o Firestore. Os totais
            podem mudar após confirmação do servidor.
          </AlertDescription>
        </Alert>
      )}
      <Button
        onClick={() => {
          const next = new URLSearchParams(params);
          next.set('includeArchived', String(!includeArchived));

          setParams(next);
        }}
        variant="ghost"
      >
        {includeArchived
          ? 'Voltar à seleção ativa'
          : 'Permitir histórico arquivado nesta consulta'}
      </Button>
      <Card className={cn('gap-0 p-4 my-4')}>
        <span className={cn('text-xs text-muted-foreground')}>
          Tempo registrado · seleção atual
        </span>
        <h2
          className={cn('text-3xl font-semibold tracking-tight tabular-nums')}
        >
          {hours(report.totalMinutes)}
        </h2>
      </Card>
      <p className={cn('text-base mb-4 text-muted-foreground')}>
        Pode somar atividades simultâneas; não representa tempo líquido único.
        Referência: {date(report.asOf)}. Política: {report.policy}.
      </p>
      <p className={cn('text-base mb-4')}>
        Estimativas não alteram fatos: orçamento global de 8 horas por
        pessoa/dia entre todos os projetos, com contexto completo. Fatos
        fechados consomem margem sem truncamento; o total exibido considera
        todos os registros selecionados.{' '}
        <RouterLink
          to="/rules"
          className={cn('text-primary underline-offset-4 hover:underline')}
        >
          Consultar regras e limites do relatório
        </RouterLink>
        .
      </p>
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
      {report.warnings.length > 0 && (
        <details className={cn('mb-4 text-muted-foreground text-sm')}>
          <summary className={cn('cursor-pointer py-2')}>
            Notas do cálculo ({report.warnings.length})
          </summary>
          <ul className={cn('pl-6')}>
            {report.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
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
                data={report.byUser.map((person, index) => ({
                  key: person.uid,
                  label: hidden ? 'Pessoa ' + (index + 1) : person.label,
                  minutes: person.minutes,
                  href: hidden
                    ? undefined
                    : '/people/' + encodeURIComponent(person.uid) + search,
                }))}
              />
            </Card>
            <TopicReport
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
                  uid: hidden ? undefined : person.uid,
                  label: person.label || 'Pessoa',
                  minutes: person.minutes,
                })),
              }))}
            />
          </div>
          <div className={cn('flex flex-col flex sm:hidden gap-2')}>
            {report.records.map((record) => (
              <Card key={record.id + record.uid} className={cn('gap-0 p-4')}>
                <p className={cn('text-lg font-semibold')}>
                  {report.byUser.find((item) => item.uid === record.uid)
                    ?.label || 'Pessoa'}
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
              <caption>
                Registros selecionados — sem texto privado ou contexto
              </caption>
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
                      {report.byUser.find((item) => item.uid === record.uid)
                        ?.label || 'Pessoa'}
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
                            report.byTopic.find(
                              (item) => item.topicId === topic.topicId,
                            )?.label ?? topic.topicId,
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
      <div className={cn('flex flex-row mt-4 gap-4')}>
        <Button
          onClick={() => setAttempt((value) => value + 1)}
          variant="ghost"
        >
          Atualizar relatório
        </Button>
      </div>
    </section>
  );
}
