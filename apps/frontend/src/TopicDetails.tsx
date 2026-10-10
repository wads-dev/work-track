import { PersonIdentity } from './PersonIdentity';
import { TableHead } from './components/ui/table';
import { cn } from './lib/utils';
import { Button } from './components/ui/button';
import { Alert, AlertDescription } from './components/ui/alert';
import { TableCell } from './components/ui/table';
import { TableRow } from './components/ui/table';
import { TableHeader } from './components/ui/table';
import { TableBody } from './components/ui/table';
import { Table } from './components/ui/table';
import { Card } from './components/ui/card';
import { Skeleton } from './components/ui/skeleton';
import { useEffect, useState } from 'react';

import { httpsCallable, type Functions } from 'firebase/functions';
import {
  Link as RouterLink,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useProjects } from './useProjects';
import { usePrivacy, isHidden } from './privacy';
import { objects, text, date } from './data';
import { hours } from './report-chart';
import { safeReturnTo, topicDetailsPath } from './routes';
import {
  projectAccessRevision,
  useProjectAccessRevision,
} from './project-access-revision';
import { deletionRevision, useDeletionRevision } from './record-deletion';
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
  const [params] = useSearchParams();
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
    if (!project || hidden || !canonical || projects.loading || projects.error)
      return;
    setState({ identity });
    void httpsCallable(
      functions,
      'getTopicReport',
    )({ projectId, topicId, includeArchived: true })
      .then((r) => {
        const data = validateTopicReport(
          r.data as TopicDetailReport,
          uid,
          projectId,
          topicId,
          canonical,
        );
        if (
          active &&
          projectAccessRevision() === access &&
          deletionRevision(uid) === deletion
        )
          setState({ identity, data });
      })
      .catch((e) => {
        if (
          active &&
          projectAccessRevision() === access &&
          deletionRevision(uid) === deletion
        )
          setState({ identity, error: reportError(e) });
      });
    return () => {
      active = false;
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
    projects.error,
    identity,
    access,
    deletion,
  ]);
  const current = state.identity === identity ? state : undefined;
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
  const data = current?.data;
  const label = text(
    objects(project?.topics).find((t) => t.id === canonical)?.title,
    'Tópico',
  );
  return (
    <div className={cn('flex flex-col min-w-0 gap-4')}>
      <div className={cn('flex flex-row gap-2 flex-wrap')}>
        <RouterLink
          to={'/projects/' + encodeURIComponent(projectId)}
          className={cn('text-primary underline-offset-4 hover:underline')}
        >
          {text(project?.title, 'Projeto')}
        </RouterLink>
        <p className={cn('text-base')}>/ {label}</p>
      </div>
      <h1
        className={cn(
          'text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]',
        )}
      >
        {label}
      </h1>
      <Button asChild variant="ghost" className={cn('self-start')}>
        <RouterLink to={safeReturnTo(params.get('returnTo'))}>
          Voltar ao contexto
        </RouterLink>
      </Button>
      {topicId !== canonical && (
        <Alert>
          <AlertDescription>
            Este tópico foi unificado. Os fatos abaixo pertencem ao tópico
            canônico{' '}
            <RouterLink
              to={topicDetailsPath(projectId, canonical) + location.search}
              className={cn('text-primary underline-offset-4 hover:underline')}
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
              <Button onClick={() => setAttempt((n) => n + 1)} variant="ghost">
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
          <Card className={cn('gap-0 p-6')}>
            <div className={cn('flex flex-col gap-2')}>
              <h2 className={cn('text-lg font-semibold')}>
                Histórico completo autorizado
              </h2>
              <p className={cn('text-base')}>
                {data.occurrenceCount} registros com este tópico ·{' '}
                {data.intervals.length} intervalos com horas computáveis
              </p>
              <p className={cn('text-base')}>
                Primeiro registro iniciado:{' '}
                {data.firstRecordStartedAt
                  ? date(data.firstRecordStartedAt)
                  : '—'}
              </p>
              <p className={cn('text-base')}>
                Último registro iniciado:{' '}
                {data.lastRecordStartedAt
                  ? date(data.lastRecordStartedAt)
                  : '—'}
              </p>
              {data.occurrenceCount === 0 && (
                <Alert>
                  <AlertDescription>
                    Nenhum registro encontrado para este tópico.
                  </AlertDescription>
                </Alert>
              )}
              <p className={cn('text-base')}>
                Tempo atribuído ao tópico: {hours(data.totalMinutes)}
              </p>
              <p className={cn('text-base')}>
                Fatos encerrados: {hours(data.closedMinutes)} · Estimativas
                abertas: {hours(data.estimatedMinutes)}
              </p>
              <p className={cn('text-base')}>
                Intervalos completos dos registros:{' '}
                {hours(data.fullRecordMinutes)} · Tempo sem divisão informada:{' '}
                {hours(data.unassignedMinutes)}
              </p>
              <p className={cn('text-sm')}>
                As datas são inícios reais dos registros, inclusive registros
                sem duração computável. Ocorrências não são horas; nenhuma
                divisão proporcional é inventada. Estimativas abertas não
                representam encerramento.
              </p>
            </div>
          </Card>
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
          {data.warnings.map((w, i) => (
            <Alert key={i} className={cn('border-amber-500/50')}>
              <AlertDescription>{w}</AlertDescription>
            </Alert>
          ))}
        </>
      )}
    </div>
  );
}
