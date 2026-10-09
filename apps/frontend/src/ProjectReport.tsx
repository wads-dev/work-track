import {
  useProjectAccessRevision,
  projectAccessRevision,
} from './project-access-revision';
import { useEffect, useState } from 'react';
import { useDeletionRevision, deletionRevision } from './record-deletion';
import {
  Alert,
  Box,
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
  IconButton,
  Tooltip,
} from '@mui/material';
import { httpsCallable, type Functions } from 'firebase/functions';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { reportError } from './report-error';
import { TopicReport } from './TopicReport';
import type { ReportTopic } from './topic-report-model';
import { date } from './data';
import { detailPath } from './routes';
import { UiIcon } from './UiIcons';

import { hours, pieSlices, type Bucket } from './report-chart';
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

function Pie({ title, buckets }: { title: string; buckets: Bucket[] }) {
  const slices = pieSlices(buckets);
  return (
    <Paper
      component="section"
      aria-label={title}
      sx={{ p: 3, flex: 1, minWidth: 0 }}
    >
      <Typography component="h3" variant="h6">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Fatias proporcionais à soma dos valores desta distribuição:{' '}
        {hours(buckets.reduce((sum, bucket) => sum + bucket.minutes, 0))}. A
        soma dos tópicos pode diferir do tempo agregado quando as durações
        informadas excedem o total; avisos abaixo explicam ambiguidades.
      </Typography>
      {slices.length === 0 ? (
        <Typography>Nenhum tempo disponível nesta página.</Typography>
      ) : (
        <>
          <Box
            component="svg"
            viewBox="0 0 200 200"
            role="img"
            aria-label={title + ' — valores na legenda abaixo'}
            sx={{
              width: 160,
              maxWidth: '100%',
              display: 'block',
              mx: 'auto',
              my: 2,
            }}
          >
            <title>{title}</title>
            {slices.map((slice, index) =>
              slice.full ? (
                <circle
                  key={index}
                  cx="100"
                  cy="100"
                  r="85"
                  fill={slice.color}
                />
              ) : (
                <path
                  key={index}
                  d={slice.path}
                  fill={slice.color}
                  stroke="white"
                />
              ),
            )}
            <Box
              component="circle"
              cx="100"
              cy="100"
              r="58"
              sx={(theme) => ({ fill: theme.palette.background.paper })}
            />
          </Box>
          <Box
            component="ul"
            sx={{
              listStyle: 'none',
              p: 0,
              m: 0,
              '& li': { py: 1, borderBottom: 1, borderColor: 'divider' },
            }}
          >
            {slices.map((slice, index) => (
              <li key={index}>
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    bgcolor: slice.color,
                    mr: 1,
                  }}
                />
                {slice.label}: {hours(slice.minutes)}
              </li>
            ))}
          </Box>
        </>
      )}
    </Paper>
  );
}
export function ProjectReport({
  functions,
  hidden,
  projectLabel = 'Projeto',
  projectId,
  search,
  uid,
}: {
  functions: Functions;
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
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setReport(null);
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
      <Stack direction="row" spacing={2} role="status">
        <CircularProgress size={24} />
        <Typography>Carregando relatório do projeto…</Typography>
      </Stack>
    );
  if (error)
    return (
      <Alert
        severity="error"
        action={
          <Button onClick={() => setAttempt((value) => value + 1)}>
            Tentar novamente
          </Button>
        }
      >
        {error}
        {!includeArchived && !hidden && (
          <Button
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('includeArchived', 'true');

              setParams(next);
            }}
          >
            Consultar histórico de projeto arquivado
          </Button>
        )}
      </Alert>
    );
  if (!report) return null;
  if (hidden)
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        Relatório, tópicos e avisos ocultos na apresentação atual. Revele dados
        no topo para visualizar. Esta ofuscação não altera permissões de acesso.
      </Alert>
    );
  return (
    <Box component="section" aria-label="Relatório do projeto" sx={{ mt: 3 }}>
      <Button
        onClick={() => {
          const next = new URLSearchParams(params);
          next.set('includeArchived', String(!includeArchived));

          setParams(next);
        }}
      >
        {includeArchived
          ? 'Voltar à seleção ativa'
          : 'Permitir histórico arquivado nesta consulta'}
      </Button>
      <Paper sx={{ p: 2, my: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Tempo registrado · seleção atual
        </Typography>
        <Typography
          component="h2"
          variant="h4"
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {hours(report.totalMinutes)}
        </Typography>
      </Paper>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Pode somar atividades simultâneas; não representa tempo líquido único.
        Referência: {date(report.asOf)}. Política: {report.policy}.
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Estimativas não alteram fatos: orçamento global de 8 horas por
        pessoa/dia entre todos os projetos, com contexto completo. Fatos
        fechados consomem margem sem truncamento; o total exibido considera
        todos os registros selecionados.{' '}
        <Link component={RouterLink} to="/rules">
          Consultar regras e limites do relatório
        </Link>
        .
      </Typography>
      {report.page.partial && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Relatório parcial
          {report.estimatedCount > 0
            ? ' com ' + report.estimatedCount + ' registro(s) estimado(s)'
            : ''}
          . Totais e gráficos representam somente esta página de até{' '}
          {report.page.limit} registros, não todo o projeto.
        </Alert>
      )}
      {report.warnings.length > 0 && (
        <Box
          component="details"
          sx={{ mb: 2, color: 'text.secondary', fontSize: 14 }}
        >
          <Box component="summary" sx={{ cursor: 'pointer', py: 1 }}>
            Notas do cálculo ({report.warnings.length})
          </Box>
          <Box component="ul" sx={{ pl: 3 }}>
            {report.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </Box>
        </Box>
      )}
      {report.records.length === 0 ? (
        <Alert severity="info">Nenhum registro disponível nesta página.</Alert>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                md: 'repeat(2, minmax(0, 1fr))',
              },
              gap: 2,
              my: 3,
              '& > *': { minWidth: 0 },
            }}
          >
            <Pie title="Tempo por pessoa" buckets={report.byUser} />
            <TopicReport
              unassignedMinutes={report.unassignedMinutes ?? 0}
              buckets={(report.byTopic ?? []).map((topic) => ({
                projectId: topic.projectId,
                topicId: topic.topicId,
                projectLabel: hidden ? 'Projeto reservado' : projectLabel,
                topicLabel: hidden
                  ? 'Assunto reservado'
                  : topic.label || 'Assunto',
                minutes: topic.minutes,
                people: (topic.byUser ?? []).map((person, index) => ({
                  key: String(index),
                  label: person.label || 'Pessoa',
                  minutes: person.minutes,
                })),
              }))}
            />
          </Box>
          <Stack spacing={1} sx={{ display: { xs: 'flex', sm: 'none' } }}>
            {report.records.map((record) => (
              <Paper key={record.id + record.uid} sx={{ p: 2 }}>
                <Typography variant="h6">
                  {report.byUser.find((item) => item.uid === record.uid)
                    ?.label || 'Pessoa'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {date(record.startedAt)} —{' '}
                  {date(record.endedAt ?? record.effectiveEndedAt)}
                </Typography>
                <Typography sx={{ mt: 1 }}>
                  {hours(record.minutes)}{' '}
                  {record.estimated
                    ? '· Estimado; fim original não informado'
                    : '· Factual'}
                </Typography>
                {record.uid === uid && (
                  <Button
                    component={RouterLink}
                    to={detailPath('records', record.id, search)}
                  >
                    Detalhes
                  </Button>
                )}
              </Paper>
            ))}
          </Stack>
          <TableContainer
            sx={{ display: { xs: 'none', sm: 'block' } }}
            component={Paper}
            tabIndex={0}
            aria-label="Registros resumidos do projeto"
          >
            <Table sx={{ minWidth: 650 }}>
              <caption>
                Registros selecionados — sem texto privado ou contexto
              </caption>
              <TableHead>
                <TableRow>
                  {['Pessoa', 'Tópicos', 'Início', 'Fim', 'Tempo'].map(
                    (label) => (
                      <TableCell key={label} scope="col">
                        {label}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {report.records.map((record) => (
                  <TableRow key={record.id + record.uid}>
                    <TableCell>
                      {report.byUser.find((item) => item.uid === record.uid)
                        ?.label || 'Pessoa'}
                      {record.uid === uid && (
                        <Tooltip title="Abrir detalhes do meu registro">
                          <IconButton
                            component={RouterLink}
                            to={detailPath('records', record.id, search)}
                            aria-label="Abrir detalhes do meu registro"
                          >
                            <UiIcon kind="detail" />
                          </IconButton>
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
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          Estimado; fim original não informado
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{hours(record.minutes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button onClick={() => setAttempt((value) => value + 1)}>
          Atualizar relatório
        </Button>
      </Stack>
    </Box>
  );
}
