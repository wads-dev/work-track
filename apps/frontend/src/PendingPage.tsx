import { useEffect, useState } from 'react';
import { isAlertOpen, isOpen } from './pending-utils';
import { useClock } from './use-clock';
import {
  Alert,
  Badge,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type Firestore,
} from 'firebase/firestore';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { date, text, type Row, useRows } from './data';
import { isHidden, safeProject, usePrivacy } from './privacy';
import { RecordDrawer } from './RecordDrawer';
import { contextualRecordPath } from './routes';
import type { Functions } from 'firebase/functions';
import { UiIcon } from './UiIcons';
export function PendingBell({ db, uid }: { db: Firestore; uid: string }) {
  const state = useRows(db, 'users/' + uid + '/records');
  const now = useClock();
  const count = state.rows.filter((row) => isAlertOpen(row.data, now)).length;
  return (
    <Tooltip title="Abertos há mais de 8 horas nos até 100 registros carregados, não contagem global">
      <IconButton
        component={RouterLink}
        to="/pending"
        aria-label={
          'Ver pendências: ' +
          count +
          ' abertos há mais de 8 horas nos até 100 registros carregados'
        }
      >
        <Badge badgeContent={count} color="warning">
          <UiIcon kind="bell" />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
export function PendingPage({
  db,
  uid,
  functions,
}: {
  db: Firestore;
  uid: string;
  functions: Functions;
}) {
  const [params, setParams] = useSearchParams();
  const cursor = params.get('after') ?? '';
  const recordId = params.get('record');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const projects = useRows(db, 'projects');
  const { revealed } = usePrivacy();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const ref = collection(db, 'users', uid, 'records');
    void getDocs(
      query(
        ref,
        orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(100),
      ),
    )
      .then((snapshot) => {
        if (active) {
          setRows(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              data: doc.data() as Record<string, unknown>,
            })),
          );
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Não foi possível consultar pendências.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [db, uid, cursor, attempt]);
  const open = rows.filter((row) => isOpen(row.data));
  return (
    <Stack spacing={2}>
      {recordId && (
        <RecordDrawer
          key={recordId}
          db={db}
          functions={functions}
          uid={uid}
          recordId={recordId}
          search={'?' + params.toString()}
          presentation="dialog"
          focusEnd
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete('record');
            setParams(next);
          }}
        />
      )}
      <Typography component="h2" variant="h5">
        Pendências — meus registros abertos
      </Typography>
      <Alert severity="info">
        Esta página examina até 100 registros próprios por ID, incluindo
        fechados, e mostra todos os abertos encontrados, incluindo os iniciados
        hoje. O sino alerta somente abertos há mais de 8 horas. Não representa
        total global nem ordem de recência. Nenhum encerramento automático é
        realizado.
      </Alert>
      {loading ? (
        <CircularProgress aria-label="Carregando pendências" />
      ) : error ? (
        <Alert
          severity="error"
          action={
            <Button onClick={() => setAttempt((v) => v + 1)}>
              Tentar novamente
            </Button>
          }
        >
          {error}
        </Alert>
      ) : (
        <>
          <Typography>
            {rows.length} registros examinados nesta página; {open.length}{' '}
            abertos encontrados.
          </Typography>
          {open.length === 0 ? (
            <Alert severity="info">
              Nenhum aberto nesta página examinada. Pode haver abertos em outras
              páginas.
            </Alert>
          ) : (
            <TableContainer
              component={Paper}
              tabIndex={0}
              aria-label="Pendências carregadas"
            >
              <Table>
                <TableHead>
                  <TableRow>
                    {['Projeto', 'Início', 'Detalhes'].map((label) => (
                      <TableCell key={label} scope="col">
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {open.map((row) => {
                    const project = projects.rows.find(
                      (p) => p.id === row.data.projectId,
                    )?.data;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          {text(safeProject(project, revealed)?.title)}
                        </TableCell>
                        <TableCell>
                          {date(row.data.startedAt, row.data.timeZone)}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Abrir detalhes do registro">
                            <IconButton
                              component={RouterLink}
                              to={contextualRecordPath(
                                '/pending',
                                '?' + params.toString(),
                                row.id,
                              )}
                              aria-label={
                                isHidden(project, revealed)
                                  ? 'Detalhes de registro reservado'
                                  : 'Abrir detalhes do registro'
                              }
                            >
                              <UiIcon kind="detail" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Stack direction="row" spacing={2}>
            {cursor && (
              <Button onClick={() => setParams({})}>Primeira página</Button>
            )}
            {rows.length === 100 && (
              <Button
                onClick={() => setParams({ after: rows[rows.length - 1].id })}
              >
                Examinar próxima página
              </Button>
            )}
            <Button onClick={() => setAttempt((v) => v + 1)}>
              Atualizar página
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}
