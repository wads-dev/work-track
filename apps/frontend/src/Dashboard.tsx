import type { ReactNode } from 'react';
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
} from '@mui/material';
import type { Firestore } from 'firebase/firestore';
import { date, object, objects, text, useRows } from './data';
import {
  Link as RouterLink,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { detailPath, matchesFilter } from './routes';

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
  uid,
  mode,
}: {
  db: Firestore;
  uid: string;
  mode: 'overview' | 'projects' | 'records';
}) {
  const projects = useRows(db, 'projects');
  const records = useRows(db, 'users/' + uid + '/records');
  const { projectId, recordId } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filter = params.get('q') ?? '';
  const projectFilter = params.get('project') ?? '';
  const selected = projectId ? projects : records;
  const selectedId = projectId ?? recordId;
  const row = selected.rows.find((item) => item.id === selectedId);
  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  if (selectedId)
    return (
      <Box component="section" aria-label="Detalhes">
        <Button
          component={RouterLink}
          to={(projectId ? '/projects' : '/records') + location.search}
          sx={{ mb: 2 }}
        >
          Voltar à lista
        </Button>
        <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
          {projectId ? 'Projeto' : 'Meu registro'} · {selectedId}
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Compartilhar esta URL não concede acesso. Registros são acessíveis
          somente ao seu dono.
        </Alert>
        {selected.loading ? (
          <CircularProgress aria-label="Carregando detalhes" />
        ) : selected.error ? (
          <Alert
            severity="error"
            action={<Button onClick={selected.retry}>Tentar novamente</Button>}
          >
            {selected.error}
          </Alert>
        ) : !row ? (
          <Alert severity="info">
            Item não disponível entre os até 100 documentos carregados. Ele pode
            estar fora do limite, não existir ou não pertencer à sua conta.
            Nenhum dado foi inferido.
          </Alert>
        ) : (
          <Paper sx={{ p: 3, overflowWrap: 'anywhere' }}>
            <Box
              component="dl"
              sx={{
                m: 0,
                '& dt': { fontWeight: 700, mt: 2 },
                '& dd': { m: 0, whiteSpace: 'pre-wrap' },
              }}
            >
              {projectId ? (
                <>
                  <dt>Título</dt>
                  <dd>{text(row.data.title)}</dd>
                  <dt>Descrição</dt>
                  <dd>{text(row.data.description)}</dd>
                  <dt>Tópicos</dt>
                  <dd>
                    {objects(row.data.topics)
                      .map(
                        (topic) =>
                          text(topic.title) + ' — ' + text(topic.description),
                      )
                      .join('\n') || 'Não informado'}
                  </dd>
                  <dt>Criado em</dt>
                  <dd>{date(row.data.createdAt)}</dd>
                </>
              ) : (
                <>
                  <dt>Projeto</dt>
                  <dd>
                    {text(
                      object(row.data.projectSnapshot).title,
                      text(row.data.projectId),
                    )}
                  </dd>
                  <dt>Tópicos</dt>
                  <dd>{topicLabels(row.data)}</dd>
                  <dt>Início</dt>
                  <dd>{date(row.data.startedAt, row.data.timeZone)}</dd>
                  <dt>Fim</dt>
                  <dd>{date(row.data.endedAt, row.data.timeZone)}</dd>
                  <dt>Fuso da atividade</dt>
                  <dd>{text(row.data.timeZone)}</dd>
                  <dt>Texto original</dt>
                  <dd>{text(row.data.originalText)}</dd>
                  <dt>Contexto</dt>
                  <dd>{text(row.data.interpretation)}</dd>
                  <dt>Gravado em (fuso do navegador)</dt>
                  <dd>{date(row.data.recordedAt)}</dd>
                </>
              )}
            </Box>
          </Paper>
        )}
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
      <Alert severity="info" sx={{ mb: 3 }}>
        Consulta somente leitura. Apenas seus próprios registros são exibidos.
        Filtros atuam sobre até 100 itens carregados por lista, não sobre todo o
        banco. Compartilhar URL não concede acesso.
      </Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          label="Filtrar texto"
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
          headers={[
            'Projeto / tópicos',
            'Início / fim',
            'Texto original',
            'Contexto',
            'Gravado em',
          ]}
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
            text(data.originalText),
            text(data.interpretation),
            <>
              {date(data.recordedAt)}
              <Typography variant="caption" sx={{ display: 'block' }}>
                Fuso do navegador · gravação, não início da atividade
              </Typography>
            </>,
          ]}
        />
      )}
    </>
  );
}
