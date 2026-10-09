import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TextField,
  Link,
  IconButton,
  Tooltip,
} from '@mui/material';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { ProjectReport } from './ProjectReport';
import { RecordDrawer } from './RecordDrawer';
import { date, object, objects, text, useRows } from './data';
import {
  Link as RouterLink,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { detailPath, matchesFilter } from './routes';
import { UiIcon } from './UiIcons';
import { usePrivacy, isHidden, safeProject, safeRecord } from './privacy';
import { ProjectEditor } from './ProjectEditor';

function DataTable({
  title,
  headers,
  state,
  render,
}: {
  title: string;
  headers: string[];
  state: ReturnType<typeof useRows>;
  render: (data: Record<string, unknown>, id: string) => ReactNode[];
}) {
  return (
    <Box component="section" aria-label={title} sx={{ mb: 4 }}>
      <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
        {title}
      </Typography>
      {state.loading ? (
        <Stack direction="row" sx={{ gap: 2 }} role="status">
          <CircularProgress size={24} aria-label="Carregando" />
          <span>Carregando {title.toLowerCase()}…</span>
        </Stack>
      ) : state.error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={state.retry}>
              Tentar novamente
            </Button>
          }
        >
          {state.error}
        </Alert>
      ) : state.rows.length === 0 ? (
        <Alert severity="info">
          Nenhum dado disponível em {title.toLowerCase()}.
        </Alert>
      ) : (
        <>
          <TableContainer
            component={Paper}
            tabIndex={0}
            aria-label={title + ' — role para ver todas as colunas'}
          >
            <Table sx={{ minWidth: 720 }}>
              <caption>
                {title} — até 100 itens. A ordem não representa os mais
                recentes.
              </caption>
              <TableHead>
                <TableRow>
                  {headers.map((header) => (
                    <TableCell key={header} scope="col">
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {state.rows.map((row) => (
                  <TableRow key={row.id}>
                    {render(row.data, row.id).map((cell, index) => (
                      <TableCell
                        key={headers[index]}
                        sx={{
                          verticalAlign: 'top',
                          minWidth: 150,
                          maxWidth: 360,
                          overflowWrap: 'anywhere',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {state.rows.length === 100 && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Limite de 100 itens atingido. Esta visão não representa
              necessariamente todos os dados.
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}
function topicLabels(data: Record<string, unknown>) {
  const snapshots = objects(data.topicSnapshots);
  return (
    objects(data.topics)
      .map((topic) => {
        const snapshot = snapshots.find((item) => item.id === topic.topicId);
        const title = text(snapshot?.title, text(topic.topicId));
        const allocation =
          typeof topic.percentage === 'number'
            ? ' · ' + topic.percentage + '%'
            : '';
        const duration =
          typeof topic.durationMinutes === 'number'
            ? ' · ' + topic.durationMinutes + ' min'
            : '';
        return title + allocation + duration;
      })
      .join('\n') || 'Não informado'
  );
}
export function Dashboard({
  db,
  functions,
  uid,
  mode,
}: {
  db: Firestore;
  functions: Functions;
  uid: string;
  mode: 'overview' | 'projects' | 'records';
}) {
  const { revealed } = usePrivacy();
  const rawProjects = useRows(db, 'projects');
  const rawRecords = useRows(db, 'users/' + uid + '/records');
  const projects = {
    ...rawProjects,
    rows: rawProjects.rows.map((row) => ({
      ...row,
      data: safeProject(row.data, revealed),
    })),
  };
  const records = {
    ...rawRecords,
    rows: rawRecords.rows.map((row) => ({
      ...row,
      data: safeRecord(
        row.data,
        isHidden(
          rawProjects.rows.find((project) => project.id === row.data.projectId)
            ?.data,
          revealed,
        ),
      ),
    })),
  };
  const { projectId, recordId } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [localFilter, setLocalFilter] = useState('');
  const filter = revealed ? localFilter : '';
  const projectFilter = params.get('project') ?? '';
  useEffect(() => {
    if (!revealed) setLocalFilter('');
    if (params.has('q')) {
      const next = new URLSearchParams(params);
      next.delete('q');
      setParams(next, { replace: true });
    }
  }, [revealed, params, setParams]);
  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key === 'q') {
      if (revealed) setLocalFilter(value);
      return;
    }
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  if (projectId)
    return (
      <Box component="section" aria-label="Projeto">
        <Button
          component={RouterLink}
          to={'/projects' + location.search}
          sx={{ mb: 2 }}
        >
          Voltar aos projetos
        </Button>
        <Typography component="h2" variant="h5">
          {text(
            projects.rows.find((item) => item.id === projectId)?.data.title,
            projectId,
          )}
        </Typography>
        <Typography color="text.secondary">
          {text(
            projects.rows.find((item) => item.id === projectId)?.data
              .description,
            'O relatório consulta o projeto diretamente, independente do limite da lista.',
          )}
        </Typography>
        <ProjectEditor
          functions={functions}
          projectId={projectId}
          project={rawProjects.rows.find((item) => item.id === projectId)?.data}
          hidden={isHidden(
            rawProjects.rows.find((item) => item.id === projectId)?.data,
            revealed,
          )}
        />
        <ProjectReport
          key={projectId}
          projectId={projectId}
          functions={functions}
          hidden={isHidden(
            rawProjects.rows.find((item) => item.id === projectId)?.data,
            revealed,
          )}
          search={location.search}
          uid={uid}
        />
      </Box>
    );
  const filteredProjects = {
    ...projects,
    rows: projects.rows.filter((row) =>
      matchesFilter(
        [
          row.id,
          row.data.title,
          row.data.description,
          ...objects(row.data.topics).map((topic) => topic.title),
        ],
        filter,
      ),
    ),
  };
  const filteredRecords = {
    ...records,
    rows: records.rows.filter(
      (row) =>
        (!projectFilter || row.data.projectId === projectFilter) &&
        matchesFilter(
          [
            row.id,
            row.data.originalText,
            row.data.interpretation,
            object(row.data.projectSnapshot).title,
            topicLabels(row.data),
          ],
          filter,
        ),
    ),
  };
  return (
    <>
      {recordId && (
        <RecordDrawer
          key={recordId}
          db={db}
          functions={functions}
          uid={uid}
          recordId={recordId}
          search={location.search}
        />
      )}
      {mode !== 'projects' && records.rows.some((row) => !row.data.endedAt) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Há registros abertos entre os itens carregados. Confira detalhes antes
          de encerrar; nada será encerrado automaticamente.
          <Box component="ul">
            {records.rows
              .filter((row) => !row.data.endedAt)
              .slice(0, 5)
              .map((row) => (
                <li key={row.id}>
                  <Link
                    component={RouterLink}
                    to={detailPath('records', row.id, location.search)}
                  >
                    {text(
                      object(row.data.projectSnapshot).title,
                      text(row.data.projectId),
                    )}{' '}
                    · {date(row.data.startedAt, row.data.timeZone)}
                  </Link>
                </li>
              ))}
          </Box>
          Até 5 abertos exibidos desta lista limitada; não é uma contagem
          global.
        </Alert>
      )}
      <Alert severity="info" sx={{ mb: 3 }}>
        Consulta somente leitura. Apenas seus próprios registros são exibidos.
        Filtros atuam sobre até 100 itens carregados por lista, não sobre todo o
        banco. Compartilhar URL não concede acesso.
      </Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          label={
            revealed
              ? 'Filtrar texto local (não compartilhado)'
              : 'Filtro textual indisponível no modo live'
          }
          disabled={!revealed}
          value={filter}
          onChange={(event) => updateFilter('q', event.target.value)}
          fullWidth
        />
        {mode !== 'projects' && (
          <TextField
            label="ID do projeto (registros)"
            value={projectFilter}
            onChange={(event) => updateFilter('project', event.target.value)}
            fullWidth
          />
        )}
        <Button
          onClick={() => {
            const next = new URLSearchParams(params);
            next.delete('q');
            next.delete('project');
            setParams(next);
          }}
        >
          Limpar filtros
        </Button>
      </Stack>
      {(projects.rows.length === 100 || records.rows.length === 100) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Uma lista atingiu o limite de leitura; filtros não incluem itens fora
          desse limite.
        </Alert>
      )}
      {mode !== 'records' && (
        <DataTable
          title="Projetos"
          headers={['Projeto', 'Descrição', 'Tópicos', 'Criado em']}
          state={filteredProjects}
          render={(data, id) => [
            <Link
              component={RouterLink}
              to={detailPath('projects', id, location.search)}
            >
              {text(data.title)}
            </Link>,
            text(data.description),
            <Stack sx={{ gap: 1 }}>
              {objects(data.topics).length === 0 && 'Não informado'}
              {objects(data.topics).map((topic, index) => (
                <Chip
                  key={text(topic.id, String(index))}
                  label={text(topic.title)}
                  size="small"
                  sx={{ alignSelf: 'start', maxWidth: '100%' }}
                />
              ))}
            </Stack>,
            date(data.createdAt),
          ]}
        />
      )}
      {mode !== 'projects' && (
        <DataTable
          title="Meus registros"
          headers={['Projeto / tópicos', 'Início / fim', 'Detalhes']}
          state={filteredRecords}
          render={(data, id) => [
            <>
              <Link
                component={RouterLink}
                to={detailPath('records', id, location.search)}
              >
                {text(object(data.projectSnapshot).title, text(data.projectId))}
              </Link>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {topicLabels(data)}
              </Typography>
            </>,
            <>
              {date(data.startedAt, data.timeZone)}
              <br />
              {data.endedAt
                ? date(data.endedAt, data.timeZone)
                : 'Fim não informado'}
              <Typography variant="caption" sx={{ display: 'block' }}>
                {text(data.timeZone, 'Fuso do navegador')}
              </Typography>
            </>,
            <Tooltip title="Abrir detalhes e auditoria">
              <IconButton
                component={RouterLink}
                to={detailPath('records', id, location.search)}
                aria-label="Abrir detalhes e auditoria do registro"
              >
                <UiIcon kind="detail" />
              </IconButton>
            </Tooltip>,
          ]}
        />
      )}
    </>
  );
}
