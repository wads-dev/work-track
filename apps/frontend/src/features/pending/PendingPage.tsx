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
import { useClock } from '../../hooks/use-clock';

import { type Firestore } from 'firebase/firestore';
import { useOwnRecords } from '../records/hooks/useOwnRecords';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { usePrivacy } from '../../shared/ui/privacy';
import { RecordDrawer } from '../records/RecordDrawer';
import { RecordsList } from '../records/RecordsList';
import type { Functions } from 'firebase/functions';
export function PendingBell({ db, uid }: { db: Firestore; uid: string }) {
  const now = useClock();
  const pending = useOwnRecords(db, uid, true, {
    openOnly: true,
    alertOnly: true,
    now: now.getTime(),
  });
  const count = pending.total;
  const bellError = Boolean(pending.error);
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
  const recordId = params.get('record');
  const pending = useOwnRecords(db, uid, true, { openOnly: true, page: 0 });
  const { rows: open, loading, fromCache, error } = pending;
  const projects = useProjects(functions, uid);
  const { revealed } = usePrivacy();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Registros sem finalização</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Revise o fim de cada registro. Nada será encerrado automaticamente.
          </p>
        </div>
        {!error && (!loading || open.length > 0) && (
          <Badge variant="secondary">
            {fromCache
              ? 'Dados provisórios'
              : open.length +
                (open.length === 1 ? ' pendência' : ' pendências')}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Atualizar pendências"
          title="Atualizar pendências"
          aria-busy={loading}
          onClick={pending.retry}
          className={loading ? '[&>svg]:motion-safe:animate-spin' : undefined}
        >
          <UiIcon kind="refresh" />
        </Button>
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
          rows: open,
          loading,
          error,
          retry: pending.retry,
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
