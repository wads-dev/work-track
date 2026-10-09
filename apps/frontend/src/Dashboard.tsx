import { useOwnRecords } from './useOwnRecords';
import { filterRecords, recordPage } from './record-filters';
import { QueryToolbar } from './QueryToolbar';
import { useProjects } from './useProjects';
import { ProjectCreate } from './ProjectCreate';
import { ProjectSelector } from './ProjectSelector';
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
  hideHeading = false,
  historical = false,
  complete = true,
  title,
  headers,
  state,
  render,
}: {
  hideHeading?: boolean;
  historical?: boolean;
  complete?: boolean;
  title: string;
  headers: string[];
  state: ReturnType<typeof useRows>;
  render: (data: Record<string, unknown>, id: string) => ReactNode[];
}) {
  return (
    <Box component="section" aria-label={title} sx={{ mb: 4 }}>
      {!hideHeading && (
        <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}
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
          {historical && !complete
            ? 'Sem resultados nos dados locais disponíveis. Aguarde a sincronização para consultar todo o histórico.'
            : 'Nenhum dado disponível em ' + title.toLowerCase() + '.'}
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
                {title}
                {title === 'Projetos'
                  ? ' — catálogo autorizado'
                  : historical
                    ? ' — página do histórico'
                    : ' — até 100 itens'}
                {historical
                  ? '. Mais recentes primeiro; datas inválidas ao final.'
                  : '. A ordem não representa os mais recentes.'}
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
          {!historical && title !== 'Projetos' && state.rows.length === 100 && (
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
  const rawRecords = useOwnRecords(db, uid, mode !== 'projects');
  const rawProjectsById = new Map(rawProjects.rows.map((row) => [row.id, row]));
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
          rawProjectsById.get(text(row.data.projectId, ''))?.data,
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
  const [query, setQuery] = useState({ uid, revealed, text: '' });
  useEffect(() => {
    setQuery({ uid, revealed, text: '' });
  }, [uid, revealed]);
  const filter =
    query.uid === uid && query.revealed === revealed ? query.text : '';
  const setLocalFilter = (text: string) => setQuery({ uid, revealed, text });
  const [pageState, setPageState] = useState({ key: '', page: 0 });
  const topicFilter = params.get('topic') ?? '';
  const fromDate = params.get('fromDate') ?? '';
  const toDate = params.get('toDate') ?? '';
  const zone = params.get('timeZone') ?? 'America/Sao_Paulo';
  const [pageSize] = useState(50);
  const pageKey = JSON.stringify([uid, revealed, filter, params.toString()]);
  const activePage = pageState.key === pageKey ? pageState.page : 0;
  const projectFilter = params.get('project') ?? '';
  const archiveFilter = params.get('status') ?? 'active';
  const projectScope = params.get('scope') === 'personal' ? 'personal' : 'work';
  useEffect(() => {
    if (params.has('q')) {
      const next = new URLSearchParams(params);
      next.delete('q');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);
  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key === 'project') next.delete('topic');
    if (key === 'q') {
      setLocalFilter(value);
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
              {rawProjectsById.get(projectId)?.data.type === 'personal'
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
            project={rawProjectsById.get(projectId)?.data}
            hidden={isHidden(rawProjectsById.get(projectId)?.data, revealed)}
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
            hidden={isHidden(rawProjectsById.get(projectId)?.data, revealed)}
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
        (rawProjectsById.get(row.id)?.data.type === 'personal'
          ? 'personal'
          : 'work') === projectScope &&
        matchesArchive(rawProjectsById.get(row.id)?.data, archiveFilter) &&
        matchesFilter(
          [
            row.id,
            rawProjectsById.get(row.id)?.data.title,
            rawProjectsById.get(row.id)?.data.description,
            ...objects(rawProjectsById.get(row.id)?.data.topics).map(
              (topic) => topic.title,
            ),
          ],
          filter,
        ),
    ),
  };
  let recordFilterError = '';
  let matchingRecords: typeof rawRecords.rows;
  try {
    matchingRecords = filterRecords(
      rawRecords.rows,
      {
        project: projectFilter,
        topic: topicFilter,
        query: '',
        fromDate,
        toDate,
        zone,
        status: params.get('recordStatus') ?? 'all',
      },
      objects(rawProjectsById.get(projectFilter)?.data.topics),
    );
  } catch (error) {
    recordFilterError =
      error instanceof Error ? error.message : 'Período inválido';
    matchingRecords = [];
  }
  const safeRecordsById = new Map(records.rows.map((row) => [row.id, row]));
  const matchingSafeRecords = matchingRecords
    .map((row) => safeRecordsById.get(row.id))
    .filter((row): row is (typeof records.rows)[number] => row !== undefined)
    .filter((row) =>
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
    );
  const page = Math.min(
    activePage,
    Math.max(0, Math.ceil(matchingSafeRecords.length / pageSize) - 1),
  );
  const filteredRecords = {
    ...records,
    error: recordFilterError || records.error,
    rows:
      mode === 'records'
        ? recordPage(matchingSafeRecords, page, pageSize)
        : matchingSafeRecords,
  };
  const topicOptions = objects(rawProjectsById.get(projectFilter)?.data.topics);
  return (
    <Box
      sx={{
        pb:
          mode === 'projects' ? 'calc(104px + env(safe-area-inset-bottom))' : 0,
      }}
    >
      {mode === 'projects' && (
        <Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0,1fr)',
                sm: 'minmax(0,1fr)',
              },
              gap: 2,
              alignItems: 'start',
              mb: 2,
            }}
          >
            <Tabs
              value={projectScope}
              onChange={(_, value: string) => updateFilter('scope', value)}
              aria-label="Acesso aos projetos"
              sx={{ minWidth: 0, '& .MuiTab-root': { minWidth: 0, px: 2 } }}
            >
              <Tab value="work" label="Compartilhados" />
              <Tab value="personal" label="Meus projetos pessoais" />
            </Tabs>
            <ProjectCreate
              functions={functions}
              onCreated={(id, type) => {
                navigate(
                  '/projects/' +
                    encodeURIComponent(id) +
                    '?tab=details&scope=' +
                    type,
                );
              }}
            />
          </Box>
          <Box
            component="section"
            aria-label="Filtros de projetos"
            sx={{
              mb: 2,
              p: { xs: 2, sm: 3 },
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              borderRadius: '12px',
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0,1fr)',
                md: 'repeat(3,minmax(0,1fr))',
              },
              gap: 2,
              alignItems: 'start',
            }}
          >
            {mode === 'projects' && (
              <TextField
                select
                label="Estado dos projetos"
                value={archiveFilter}
                onChange={(e) => updateFilter('status', e.target.value)}
                size="small"
                sx={{ minWidth: 0, gridColumn: { md: 2 }, gridRow: { md: 1 } }}
              >
                <MenuItem value="active">Ativos</MenuItem>
                <MenuItem value="archived">Arquivados</MenuItem>
                <MenuItem value="all">Todos</MenuItem>
              </TextField>
            )}

            <TextField
              label="Pesquisar projetos"
              value={filter}
              onChange={(event) => updateFilter('q', event.target.value)}
              fullWidth
              sx={{ gridColumn: { md: 1 }, gridRow: { md: 1 } }}
            />

            <Button
              sx={{ whiteSpace: 'nowrap', minHeight: { xs: 44, md: 40 } }}
              onClick={() => {
                const next = new URLSearchParams(params);
                setLocalFilter('');
                next.delete('q');
                next.delete('project');
                next.delete('status');
                setParams(next);
              }}
            >
              Limpar filtros
            </Button>
          </Box>
        </Box>
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
          Até 5 registros abertos exibidos neste resumo.
        </Alert>
      )}
      {mode !== 'projects' && (
        <QueryToolbar
          label="Filtros de registros"
          sx={{
            mb: 2,
            p: { xs: 2, sm: 3 },
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0,1fr)',
              md: 'minmax(280px,1fr) minmax(280px,360px) auto',
            },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <TextField
            label="Pesquisar registros"
            value={filter}
            onChange={(event) => updateFilter('q', event.target.value)}
            fullWidth
          />
          <>
            <ProjectSelector
              key={uid + String(revealed)}
              projects={rawProjects.rows.map((row) => ({
                id: row.id,
                label: text(
                  safeProject(row.data, revealed).title,
                  'Projeto reservado',
                ),
                searchText:
                  text(row.data.title, '') +
                  ' ' +
                  text(row.data.description, ''),
              }))}
              projectId={projectFilter}
              loading={rawProjects.loading}
              error={rawProjects.error}
              onChange={(id) => updateFilter('project', id)}
            />
          </>
          <TextField
            select
            label="Assunto / tópico"
            value={topicFilter}
            disabled={!projectFilter}
            onChange={(e) => updateFilter('topic', e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Todos os assuntos</MenuItem>
            {topicOptions.map((topic) => (
              <MenuItem key={text(topic.id)} value={text(topic.id)}>
                {isHidden(rawProjectsById.get(projectFilter)?.data, revealed)
                  ? 'Assunto reservado'
                  : text(topic.title)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="date"
            label="De"
            value={fromDate}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => updateFilter('fromDate', e.target.value)}
          />
          <TextField
            type="date"
            label="Até"
            value={toDate}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => updateFilter('toDate', e.target.value)}
          />
          <TextField
            label="Fuso do período"
            value={zone}
            onChange={(e) => updateFilter('timeZone', e.target.value)}
          />
          <TextField
            select
            label="Estado do registro"
            value={params.get('recordStatus') ?? 'all'}
            onChange={(e) => updateFilter('recordStatus', e.target.value)}
          >
            <MenuItem value="all">Todos</MenuItem>
            <MenuItem value="open">Em aberto</MenuItem>
            <MenuItem value="closed">Encerrados</MenuItem>
          </TextField>
          {rawRecords.error && (
            <Button onClick={rawRecords.retry}>Tentar novamente</Button>
          )}

          <Button
            sx={{ whiteSpace: 'nowrap', minHeight: 44 }}
            onClick={() => {
              const next = new URLSearchParams(params);
              setLocalFilter('');
              next.delete('q');
              for (const key of [
                'project',
                'topic',
                'fromDate',
                'toDate',
                'recordStatus',
                'timeZone',
              ])
                next.delete(key);
              setParams(next);
            }}
          >
            Limpar filtros
          </Button>
        </QueryToolbar>
      )}
      {mode !== 'projects' && (
        <Typography variant="caption" color="text.secondary">
          {rawRecords.complete
            ? 'Histórico completo sincronizado.'
            : 'Dados locais podem estar incompletos; aguardando sincronização com o servidor.'}{' '}
          Mais recentes primeiro; datas inválidas ao final.
        </Typography>
      )}
      {mode !== 'records' && (
        <DataTable
          hideHeading={mode === 'projects'}
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
          hideHeading={mode === 'records'}
          historical
          complete={rawRecords.complete}
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
      {mode === 'records' && (
        <>
          <Typography variant="caption">
            Período: sobreposição para encerrados; data de início para abertos,
            sem estimar horas.
          </Typography>
          <Stack
            direction="row"
            spacing={2}
            sx={{ mt: 2, alignItems: 'center' }}
          >
            <Button
              disabled={page === 0}
              onClick={() => setPageState({ key: pageKey, page: page - 1 })}
            >
              Anterior
            </Button>
            <Typography role="status">
              Página {page + 1} ·{' '}
              {rawRecords.complete
                ? matchingSafeRecords.length + ' registros encontrados'
                : 'resultado parcial'}
            </Typography>
            <Button
              disabled={(page + 1) * pageSize >= matchingSafeRecords.length}
              onClick={() => setPageState({ key: pageKey, page: page + 1 })}
            >
              Próxima
            </Button>
          </Stack>
        </>
      )}
    </Box>
  );
}
