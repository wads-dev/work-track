import { cn } from '../../lib/utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '../../components/ui/tooltip';
import { UiIcon } from '../../shared/ui/UiIcons';
import { Button } from '../../components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { useProjects } from '../projects/hooks/useProjects';
import {
  isDeletedRecord,
  useDeletionRevision,
} from '../../data/cache/record-deletion';
import { useEffect, useState } from 'react';
import { isAlertOpen, isOpen } from './pending-utils';
import { useClock } from '../../hooks/use-clock';

import { type Firestore } from 'firebase/firestore';
import { subscribeAuthorizedOwnRecords } from '../../data/sources/authorized-own-record-source';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { type Row } from '../../shared/data';
import { usePrivacy } from '../../shared/ui/privacy';
import { RecordDrawer } from '../records/RecordDrawer';
import { RecordsList } from '../records/RecordsList';
import { sortRecords } from '../records/record-filters';
import type { Functions } from 'firebase/functions';
export function PendingBell({ db, uid }: { db: Firestore; uid: string }) {
  // Fetch only indexed open records, never a sample of the history.
  const [bellError, setBellError] = useState(false);
  const [snapshot, setSnapshot] = useState<{ uid: string; rows: Row[] }>({
    uid: '',
    rows: [],
  });
  useEffect(() => {
    let active = true;
    setBellError(false);
    const stop = subscribeAuthorizedOwnRecords(
      db,
      uid,
      (s) => {
        if (active) {
          setBellError(false);
          setSnapshot({
            uid,
            rows: s.rows.filter((r) => !isDeletedRecord(r.data)),
          });
        }
      },
      () => {
        if (active) {
          setBellError(true);
          setSnapshot({ uid, rows: [] });
        }
      },
      { openOnly: true },
    );
    return () => {
      active = false;
      stop();
    };
  }, [db, uid]);
  const now = useClock();
  const count = (snapshot.uid === uid ? snapshot.rows : []).filter((row) =>
    isAlertOpen(row.data, now),
  ).length;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={
            'Ver pendências: ' + count + ' abertos há mais de 8 horas'
          }
          asChild
          variant="ghost"
          size="icon"
          className={cn('shrink-0', 'size-9')}
        >
          <RouterLink
            to={'/pending'}
            aria-label={
              'Ver pendências: ' + count + ' abertos há mais de 8 horas'
            }
          >
            <span>
              <span className="relative inline-flex">
                <UiIcon kind="bell" />
                <Badge className="absolute -right-3 -top-2 px-1 text-[10px]">
                  {bellError ? '!' : count}
                </Badge>
              </span>
            </span>
          </RouterLink>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {bellError
          ? 'Não foi possível consultar pendências.'
          : 'Registros abertos há mais de 8 horas'}
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
  const recordId = params.get('record');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const projects = useProjects(functions, uid);
  const { revealed } = usePrivacy();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFromCache(true);
    setError('');
    setRows([]);
    const stop = subscribeAuthorizedOwnRecords(
      db,
      uid,
      (page) => {
        if (!active) return;
        setRows(page.rows.filter((r) => !isDeletedRecord(r.data)));
        setFromCache(page.fromCache);
        setLoading(false);
      },
      () => {
        if (active) {
          setRows([]);
          setError('Não foi possível consultar pendências.');
          setLoading(false);
        }
      },
      { openOnly: true },
    );
    return () => {
      active = false;
      stop();
    };
  }, [db, uid, attempt, revision]);
  const open = rows.filter((row) => isOpen(row.data));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Registros sem finalização</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Revise o fim de cada registro. Nada será encerrado automaticamente.
          </p>
        </div>
        {!loading && !error && (
          <Badge variant="secondary">
            {fromCache
              ? 'Dados provisórios'
              : open.length +
                (open.length === 1 ? ' pendência' : ' pendências')}
          </Badge>
        )}
      </header>
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
      {fromCache && !loading && !error && (
        <Alert>
          <AlertTitle>Pendências provisórias</AlertTitle>
          <AlertDescription>
            Dados locais ainda não confirmados. Aguarde a sincronização para
            consultar todas as pendências.
          </AlertDescription>
        </Alert>
      )}
      <RecordsList
        state={{
          rows: sortRecords(open),
          loading,
          error,
          retry: () => setAttempt((v) => v + 1),
        }}
        catalog={projects.rows}
        revealed={revealed}
        pathname="/pending"
        search={'?' + params.toString()}
        complete={!fromCache}
        pending
      />
    </div>
  );
}
