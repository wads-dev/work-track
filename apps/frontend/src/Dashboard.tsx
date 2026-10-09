import { useProjects } from './useProjects';
import { ProjectCreate } from './ProjectCreate';
import { writeUrlTab } from './url-tabs';
import { useEffect, useState, type ReactNode } from 'react';
import { isOpen } from './pending-utils';
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
  MenuItem,
  Tabs,
  Tab,
} from '@mui/material';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { ProjectReport } from './ProjectReport';
import { RecordDrawer } from './RecordDrawer';
import { date, object, objects, text, useRows } from './data';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { detailPath, matchesFilter, contextualRecordPath } from './routes';
import { UiIcon } from './UiIcons';
import { usePrivacy, isHidden, safeProject, safeRecord } from './privacy';
import { ProjectEditor } from './ProjectEditor';
import { matchesArchive } from './project-archive';

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
          <Stack sx={{ display: { xs: 'flex', sm: 'none' } }} spacing={1.5}>
            {state.rows.map((row) => (
              <Paper key={row.id} sx={{ p: 2 }}>
                {render(row.data, row.id).map((cell, index) => (
                  <Box
                    key={headers[index]}
                    sx={{ mb: 1, overflowWrap: 'anywhere' }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {headers[index]}
                    </Typography>
                    <Box sx={{ fontSize: 14 }}>{cell}</Box>
                  </Box>
                ))}
              </Paper>
            ))}
          </Stack>
          <TableContainer
            sx={{ display: { xs: 'none', sm: 'block' } }}
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
  const rawProjects = useProjects(functions, uid);
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
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const recordId = params.get('record');
  const projectTab = params.get('tab') === 'details' ? 'details' : 'overview';
  const setProjectTab = (value: string) => {
    const next = writeUrlTab(params, 'tab', value);
    navigate({
      pathname: location.pathname,
      search: '?' + next.toString(),
      hash: location.hash,
    });
  };
  useEffect(() => {
    if (projectId && params.get('tab') !== projectTab) {
      const next = new URLSearchParams(params);
      next.set('tab', projectTab);
      navigate(
        {
          pathname: location.pathname,
          search: '?' + next.toString(),
          hash: location.hash,
        },
        { replace: true },
      );
    }
  }, [
    projectId,
    projectTab,
    params,
    navigate,
    location.pathname,
    location.hash,
  ]);
  const [localFilter, setLocalFilter] = useState('');
  const filter = revealed ? localFilter : '';
  const projectFilter = params.get('project') ?? '';
  const archiveFilter = params.get('status') ?? 'active';
  const projectScope = params.get('scope') === 'personal' ? 'personal' : 'work';
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
        {!rawProjects.loading &&
          rawProjects.rows.some((row) => row.id === projectId) && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {rawProjects.rows.find((row) => row.id === projectId)?.data
                .type === 'personal'
                ? 'Pessoal · acesso somente ao dono'
                : 'Compartilhado · usuários autorizados da empresa'}
            </Typography>
          )}
        <Tabs
          value={projectTab}
          onChange={(_, value) => setProjectTab(value)}
          aria-label="Seções do projeto"
          sx={{ mt: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            id="project-tab-overview"
            aria-controls="project-panel-overview"
            value="overview"
            label="Visão geral"
          />
          <Tab
            id="project-tab-details"
            aria-controls="project-panel-details"
            value="details"
            label="Detalhes / Editar"
          />
        </Tabs>
        <Box
          role="tabpanel"
          id="project-panel-details"
          aria-labelledby="project-tab-details"
          hidden={projectTab !== 'details'}
        >
          <ProjectEditor
            functions={functions}
            projectId={projectId}
            project={
              rawProjects.rows.find((item) => item.id === projectId)?.data
            }
            hidden={isHidden(
              rawProjects.rows.find((item) => item.id === projectId)?.data,
              revealed,
            )}
          />
        </Box>
        <Box
          role="tabpanel"
          id="project-panel-overview"
          aria-labelledby="project-tab-overview"
          hidden={projectTab !== 'overview'}
        >
          <ProjectReport
            projectLabel={text(
              projects.rows.find((row) => row.id === projectId)?.data.title,
              'Projeto reservado',
            )}
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
      </Box>
    );
  const filteredProjects = {
    ...projects,
    rows: projects.rows.filter(
      (row) =>
        (rawProjects.rows.find((project) => project.id === row.id)?.data
          .type === 'personal'
          ? 'personal'
          : 'work') === projectScope &&
        matchesArchive(
          rawProjects.rows.find((project) => project.id === row.id)?.data,
          archiveFilter,
        ) &&
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
      {mode === 'projects' && (
        <Box sx={{ mb: 2 }}>
          <Tabs
            value={projectScope}
            onChange={(_, value: string) => updateFilter('scope', value)}
            aria-label="Acesso aos projetos"
          >
            <Tab value="work" label="Compartilhados" />
            <Tab value="personal" label="Meus projetos pessoais" />
          </Tabs>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {projectScope === 'personal'
              ? 'Acesso somente ao dono. Outros usuários não podem consultar estes projetos.'
              : 'Projetos corporativos acessíveis aos usuários autorizados da empresa.'}{' '}
            Confidencialidade é uma ofuscação visual separada; não modifica o
            acesso.
          </Typography>
        </Box>
      )}
      {mode === 'projects' && (
        <ProjectCreate
          functions={functions}
          onCreated={(id, type) => {
            rawProjects.retry();
            navigate(
              '/projects/' +
                encodeURIComponent(id) +
                '?tab=details&scope=' +
                type,
            );
          }}
        />
      )}
      {recordId && (
        <RecordDrawer
          key={recordId}
          db={db}
          functions={functions}
          uid={uid}
          recordId={recordId}
          search={location.search}
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete('record');
            setParams(next);
          }}
        />
      )}
      {mode !== 'projects' && records.rows.some((row) => isOpen(row.data)) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Há registros abertos entre os itens carregados. Confira detalhes antes
          de encerrar; nada será encerrado automaticamente.
          <Box component="ul">
            {records.rows
              .filter((row) => isOpen(row.data))
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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        {mode === 'projects' && (
          <TextField
            select
            label="Projetos por estado (lista carregada)"
            value={archiveFilter}
            onChange={(e) => updateFilter('status', e.target.value)}
            size="small"
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="active">Ativos</MenuItem>
            <MenuItem value="archived">Arquivados</MenuItem>
            <MenuItem value="all">Todos</MenuItem>
          </TextField>
        )}

        <TextField
          label={
            revealed
              ? 'Filtrar texto local (não compartilhado)'
              : 'Filtro textual indisponível no modo seguro'
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
                to={contextualRecordPath(
                  location.pathname,
                  location.search,
                  id,
                )}
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
            </>,
            <Tooltip title="Abrir detalhes e auditoria">
              <IconButton
                component={RouterLink}
                to={contextualRecordPath(
                  location.pathname,
                  location.search,
                  id,
                )}
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
