import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
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
    return <CircularProgress aria-label="Carregando assunto" />;
  if (projects.error) return <Alert severity="error">{projects.error}</Alert>;
  if (hidden)
    return (
      <Alert severity="info">
        Assunto reservado ou projeto indisponível. Revele o conteúdo autorizado
        para consultar detalhes.
      </Alert>
    );
  if (!canonical)
    return (
      <Alert severity="error">
        Assunto indisponível ou unificação inconsistente. Nenhum relatório
        alternativo foi consultado.
      </Alert>
    );
  const data = current?.data;
  const label = text(
    objects(project?.topics).find((t) => t.id === canonical)?.title,
    'Assunto',
  );
  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Link
          component={RouterLink}
          to={'/projects/' + encodeURIComponent(projectId)}
        >
          {text(project?.title, 'Projeto')}
        </Link>
        <Typography>/ {label}</Typography>
      </Stack>
      <Typography component="h1" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
        {label}
      </Typography>
      <Button
        component={RouterLink}
        to={safeReturnTo(params.get('returnTo'))}
        sx={{ alignSelf: 'start' }}
      >
        Voltar ao contexto
      </Button>
      {topicId !== canonical && (
        <Alert severity="info">
          Este assunto foi unificado. Os fatos abaixo pertencem ao assunto
          canônico{' '}
          <Link
            component={RouterLink}
            to={topicDetailsPath(projectId, canonical) + location.search}
          >
            {label}
          </Link>
          .
        </Alert>
      )}
      {current?.error ? (
        <Alert
          severity="error"
          action={
            <Button onClick={() => setAttempt((n) => n + 1)}>
              Tentar novamente
            </Button>
          }
        >
          {current.error}
        </Alert>
      ) : !data ? (
        <CircularProgress aria-label="Carregando relatório do assunto" />
      ) : (
        <>
          <Paper sx={{ p: 3 }}>
            <Stack spacing={1}>
              <Typography component="h2" variant="h6">
                Histórico completo autorizado
              </Typography>
              <Typography>
                {data.occurrenceCount} registros com este assunto ·{' '}
                {data.intervals.length} intervalos com horas computáveis
              </Typography>
              <Typography>
                Primeiro registro iniciado:{' '}
                {data.firstRecordStartedAt
                  ? date(data.firstRecordStartedAt)
                  : '—'}
              </Typography>
              <Typography>
                Último registro iniciado:{' '}
                {data.lastRecordStartedAt
                  ? date(data.lastRecordStartedAt)
                  : '—'}
              </Typography>
              {data.occurrenceCount === 0 && (
                <Alert severity="info">
                  Nenhum registro encontrado para este assunto.
                </Alert>
              )}
              <Typography>
                Tempo atribuído ao assunto: {hours(data.totalMinutes)}
              </Typography>
              <Typography>
                Fatos encerrados: {hours(data.closedMinutes)} · Estimativas
                abertas: {hours(data.estimatedMinutes)}
              </Typography>
              <Typography>
                Intervalos completos dos registros:{' '}
                {hours(data.fullRecordMinutes)} · Tempo sem divisão informada:{' '}
                {hours(data.unassignedMinutes)}
              </Typography>
              <Typography variant="body2">
                As datas são inícios reais dos registros, inclusive registros
                sem duração computável. Ocorrências não são horas; nenhuma
                divisão proporcional é inventada. Estimativas abertas não
                representam encerramento.
              </Typography>
            </Stack>
          </Paper>
          <Paper sx={{ p: 3, minWidth: 0 }}>
            <Typography component="h2" variant="h6">
              Participantes
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
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
                      <TableCell key={h}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.participants.map((p) => (
                    <TableRow key={p.uid}>
                      <TableCell>
                        {p.uid === uid ? 'Você' : p.label || 'Pessoa'}
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
            </TableContainer>
            {data.participants.length === 0 && (
              <Typography>Sem participantes com registros.</Typography>
            )}
          </Paper>
          {data.warnings.map((w, i) => (
            <Alert severity="warning" key={i}>
              {w}
            </Alert>
          ))}
        </>
      )}
    </Stack>
  );
}
