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
} from '@mui/material';
import type { Firestore } from 'firebase/firestore';
import { date, object, objects, text, useRows } from './data';

function DataTable({
  title,
  headers,
  state,
  render,
}: {
  title: string;
  headers: string[];
  state: ReturnType<typeof useRows>;
  render: (data: Record<string, unknown>) => ReactNode[];
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
                    {render(row.data).map((cell, index) => (
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
export function Dashboard({ db, uid }: { db: Firestore; uid: string }) {
  const projects = useRows(db, 'projects');
  const records = useRows(db, 'users/' + uid + '/records');
  return (
    <>
      <Alert severity="info" sx={{ mb: 4 }}>
        Consulta somente leitura. Crie projetos e registre atividades pelo seu
        cliente MCP em /mcp. Apenas seus próprios registros são exibidos.
      </Alert>
      <DataTable
        title="Projetos"
        headers={['Projeto', 'Descrição', 'Tópicos', 'Criado em']}
        state={projects}
        render={(data) => [
          text(data.title),
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
      <DataTable
        title="Meus registros"
        headers={[
          'Projeto / tópicos',
          'Início / fim',
          'Texto original',
          'Contexto',
          'Gravado em',
        ]}
        state={records}
        render={(data) => [
          <>
            <Typography sx={{ fontWeight: 600 }}>
              {text(object(data.projectSnapshot).title, text(data.projectId))}
            </Typography>
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
    </>
  );
}
