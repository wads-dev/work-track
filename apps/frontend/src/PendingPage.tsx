import { cn } from './lib/utils';
import { Button } from './components/ui/button';
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
import { Card } from './components/ui/card';
import { Alert, AlertDescription } from './components/ui/alert';
import { Skeleton } from './components/ui/skeleton';
import { Badge } from './components/ui/badge';
import { useProjects } from './useProjects';
import { isDeletedRecord, useDeletionRevision } from './record-deletion';
import { useEffect, useState } from 'react';
import { isAlertOpen, isOpen } from './pending-utils';
import { useClock } from './use-clock';

import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  limit,
  orderBy,
  query,
  startAfter,
  type Firestore,
} from 'firebase/firestore';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { date, text, type Row } from './data';
import { isHidden, safeProject, usePrivacy } from './privacy';
import { RecordDrawer } from './RecordDrawer';
import { contextualRecordPath } from './routes';
import type { Functions } from 'firebase/functions';
import { UiIcon } from './UiIcons';
export function PendingBell({ db, uid }: { db: Firestore; uid: string }) {
  // This header is mounted on every route. Its deliberately partial counter
  // must not connect the entire history repository just to use its first 100.
  const [snapshot, setSnapshot] = useState<{ uid: string; rows: Row[] }>({
    uid: '',
    rows: [],
  });
  useEffect(() => {
    let active = true;
    const stop = onSnapshot(
      query(
        collection(db, 'users', uid, 'records'),
        orderBy(documentId()),
        limit(100),
      ),
      { includeMetadataChanges: true },
      (s) => {
        if (active)
          setSnapshot({
            uid,
            rows: s.docs
              .map((d) => ({ id: d.id, data: d.data() }))
              .filter((r) => !isDeletedRecord(r.data)),
          });
      },
      () => {
        if (active) setSnapshot({ uid, rows: [] });
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [db, uid]);
  const now = useClock();
  const count = (snapshot.uid === uid ? snapshot.rows : [])
    .slice(0, 100)
    .filter((row) => isAlertOpen(row.data, now)).length;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={
            'Ver pendências: ' +
            count +
            ' abertos há mais de 8 horas nos até 100 registros carregados'
          }
          asChild
          variant="ghost"
          size="icon"
          className={cn('shrink-0', 'size-9')}
        >
          <RouterLink
            to={'/pending'}
            aria-label={
              'Ver pendências: ' +
              count +
              ' abertos há mais de 8 horas nos até 100 registros carregados'
            }
          >
            <span>
              <span className="relative inline-flex">
                <UiIcon kind="bell" />
                <Badge className="absolute -right-3 -top-2 px-1 text-[10px]">
                  {count}
                </Badge>
              </span>
            </span>
          </RouterLink>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {
          'Abertos há mais de 8 horas nos até 100 registros carregados, não contagem global'
        }
      </TooltipContent>
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
  const revision = useDeletionRevision(uid);
  const cursor = params.get('after') ?? '';
  const recordId = params.get('record');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const projects = useProjects(functions, uid);
  const { revealed } = usePrivacy();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const ref = collection(db, 'users', uid, 'records');
    void (async () => {
      const activeRows: Row[] = [];
      let after = cursor;
      while (active && activeRows.length < 100) {
        const snapshot = await getDocs(
          query(
            ref,
            orderBy(documentId()),
            ...(after ? [startAfter(after)] : []),
            limit(100),
          ),
        );
        for (const doc of snapshot.docs) {
          if (!isDeletedRecord(doc.data()))
            activeRows.push({ id: doc.id, data: doc.data() });
          if (activeRows.length === 100) break;
        }
        if (snapshot.size < 100 || activeRows.length === 100) break;
        after = snapshot.docs[snapshot.docs.length - 1].id;
      }
      return activeRows;
    })()
      .then((activeRows) => {
        if (active) {
          setRows(activeRows);
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
  }, [db, uid, cursor, attempt, revision]);
  const open = rows.filter((row) => isOpen(row.data));
  return (
    <div className={cn('flex flex-col gap-4')}>
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
      {loading ? (
        <Skeleton
          role="status"
          aria-label="Carregando pendências"
          className={cn('size-6 rounded-full')}
        />
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <div className="mt-2">
              <Button onClick={() => setAttempt((v) => v + 1)} variant="ghost">
                Tentar novamente
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <p className={cn('text-base')}>
            {rows.length} registros examinados nesta página; {open.length}{' '}
            abertos encontrados.
          </p>
          {open.length === 0 ? (
            <Alert>
              <AlertDescription>
                Nenhum aberto nesta página examinada. Pode haver abertos em
                outras páginas.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className={cn('flex flex-col flex sm:hidden gap-3')}>
                {open.map((row) => (
                  <Card key={row.id} className={cn('gap-0 p-4')}>
                    <p className={cn('text-lg font-semibold')}>
                      {text(
                        safeProject(
                          projects.rows.find((p) => p.id === row.data.projectId)
                            ?.data,
                          revealed,
                        )?.title,
                      )}
                    </p>
                    <p className={cn('text-sm text-muted-foreground')}>
                      {date(row.data.startedAt, row.data.timeZone)}
                    </p>
                    <Button asChild variant="ghost">
                      <RouterLink
                        to={contextualRecordPath(
                          '/pending',
                          '?' + params.toString(),
                          row.id,
                        )}
                      >
                        Revisar fim
                      </RouterLink>
                    </Button>
                  </Card>
                ))}
              </div>
              <div
                tabIndex={0}
                aria-label="Pendências carregadas"
                className={cn(
                  'hidden sm:block overflow-x-auto rounded-xl border',
                )}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      {['Projeto', 'Início', 'Detalhes'].map((label) => (
                        <TableHead key={label} scope="col">
                          {label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
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
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  aria-label={
                                    isHidden(project, revealed)
                                      ? 'Detalhes de registro reservado'
                                      : 'Abrir detalhes do registro'
                                  }
                                  asChild
                                  variant="ghost"
                                  size="icon"
                                  className={cn('shrink-0', 'size-9')}
                                >
                                  <RouterLink
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
                                  </RouterLink>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {'Abrir detalhes do registro'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          <div className={cn('flex flex-row gap-4')}>
            {cursor && (
              <Button onClick={() => setParams({})} variant="ghost">
                Primeira página
              </Button>
            )}
            {rows.length === 100 && (
              <Button
                onClick={() => setParams({ after: rows[rows.length - 1].id })}
                variant="ghost"
              >
                Examinar próxima página
              </Button>
            )}
            <Button onClick={() => setAttempt((v) => v + 1)} variant="ghost">
              Atualizar página
            </Button>
          </div>
        </>
      )}
      <span className={cn('text-xs text-muted-foreground')}>
        Até 100 registros examinados por página; contagem carregada, não global.
        Sino: abertos há mais de 8h.
      </span>
    </div>
  );
}
