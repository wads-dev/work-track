import { createCallable } from '../../infrastructure/firebase/callable-command-gateway';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { TabsTrigger, Tabs, TabsList } from '../../components/ui/tabs';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '../../components/ui/sheet';
import { MoveDialog } from './MoveDialog';
import { hardDeleteRecord } from '../../infrastructure/firebase/hard-delete-record';
import { useProjects } from '../projects/hooks/useProjects';
import { canFinishNow, createFinishNowCommand } from './finish-now';
import {
  isDeletedRecord,
  createDeletionObserver,
  notifyRecordDeletion,
} from '../../data/cache/record-deletion';
import { writeUrlTab } from '../../app/url-tabs';
import { UiIcon } from '../../shared/ui/UiIcons';
import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { date, object, objects, text, useRows } from '../../shared/data';
import { validateEnd, localEndToIso, endToLocal } from './record-edit';
import { safeReturnTo } from '../../app/routes';
import { usePrivacy, isHidden } from '../../shared/ui/privacy';

export function RecordDrawer({
  db,
  functions,
  uid,
  recordId,
  search,
  presentation = 'drawer',
  onClose,
  focusEnd = false,
}: {
  db: Firestore;
  functions: Functions;
  uid: string;
  recordId: string;
  search: string;
  presentation?: 'drawer' | 'dialog' | 'page';
  onClose?: () => void;
  focusEnd?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tabParams] = useSearchParams();
  const rawTab = tabParams.get('recordTab');
  const activeTab =
    rawTab === 'details' || rawTab === 'edit' || rawTab === 'history'
      ? rawTab
      : focusEnd
        ? 'edit'
        : 'details';
  useEffect(() => {
    if (rawTab !== activeTab) {
      const next = new URLSearchParams(tabParams);
      next.set('recordTab', activeTab);
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
    rawTab,
    activeTab,
    tabParams,
    navigate,
    location.pathname,
    location.hash,
  ]);
  const setActiveTab = (value: string) => {
    const next = writeUrlTab(tabParams, 'recordTab', value);
    navigate({
      pathname: location.pathname,
      search: '?' + next.toString(),
      hash: location.hash,
    });
  };
  const editOpen = activeTab === 'edit';
  const detailsOpen = activeTab === 'details';
  const close = () => {
    if (mutationBusy.current || moveOpen) return;
    if (onClose) onClose();
    else navigate(closePath);
  };
  const requestedReturn = new URLSearchParams(search).get('returnTo');
  const closePath = requestedReturn
    ? safeReturnTo(requestedReturn)
    : '/records' + search;
  const { revealed } = usePrivacy();
  const projects = useProjects(functions, uid);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [finishError, setFinishError] = useState('');
  const [finishSuccess, setFinishSuccess] = useState(false);
  const finishCommand = useRef(createFinishNowCommand());
  const editorDirty = useRef(false);
  const mutationBusy = useRef(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const currentScope = useRef(uid + '/' + recordId);
  currentScope.current = uid + '/' + recordId;
  const [end, setEnd] = useState('');
  const [removeEnd, setRemoveEnd] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [success, setSuccess] = useState('');
  const intent = useRef<{
    key: string;
    requestId: string;
    expectedUpdatedAt: string | null;
  } | null>(null);
  const audit = useRows(
    db,
    'users/' + uid + '/records/' + recordId + '/audit',
    20,
  );
  useEffect(() => {
    setRecord(null);
    editorDirty.current = false;
    mutationBusy.current = false;
    setMoveOpen(false);
    setMoving(false);
    setRemoving(false);
    setRemoveError('');
    finishCommand.current = createFinishNowCommand();
    setFinishing(false);
    setFinishError('');
    setFinishSuccess(false);
    setLoading(true);
    setError('');
    const observeDeletion = createDeletionObserver(uid);
    let alive = true;
    const stop = onSnapshot(
      doc(db, 'users', uid, 'records', recordId),
      (snapshot) => {
        if (!alive) return;
        const data = snapshot.exists()
          ? (snapshot.data() as Record<string, unknown>)
          : null;
        if (data) observeDeletion([{ id: recordId, data }]);
        const activeRecord = data && !isDeletedRecord(data) ? data : null;
        setRecord(activeRecord);
        setLoading(false);
        if (activeRecord && !editorDirty.current) {
          setEnd(endToLocal(activeRecord.endedAt));
          setConfirmed(false);
        }
      },
      () => {
        if (!alive) return;
        setLoading(false);
        setError('Não foi possível consultar este registro privado.');
      },
    );
    return () => {
      alive = false;
      stop();
    };
  }, [db, uid, recordId]);
  async function removeRecord() {
    if (mutationBusy.current || moveOpen || !record || record.uid !== uid)
      return;
    if (
      !window.confirm(
        'Remover este registro definitivamente? Esta ação não pode ser desfeita.',
      )
    )
      return;
    mutationBusy.current = true;
    const scope = uid + '/' + recordId;
    setRemoving(true);
    setRemoveError('');
    try {
      await hardDeleteRecord(db, uid, recordId);
      notifyRecordDeletion(uid);
      if (currentScope.current === scope) {
        mutationBusy.current = false;
        close();
      }
    } catch (failure) {
      if (currentScope.current === scope) {
        const denied =
          failure &&
          typeof failure === 'object' &&
          'code' in failure &&
          failure.code === 'permission-denied';
        setRemoveError(
          denied
            ? 'A exclusão foi bloqueada pelas regras do Firestore. É necessário permitir delete para o dono do registro.'
            : 'Não foi possível remover o registro. Tente novamente.',
        );
      }
    } finally {
      if (currentScope.current === scope) {
        mutationBusy.current = false;
        setRemoving(false);
      }
    }
  }
  async function finishNow() {
    if (saving || finishing || finishSuccess || !canFinishNow(record, uid))
      return;
    if (mutationBusy.current || moveOpen) return;
    mutationBusy.current = true;
    const scope = uid + '/' + recordId;
    setFinishing(true);
    setFinishError('');
    setFinishSuccess(false);
    try {
      const done = await finishCommand.current.run(
        recordId,
        uid,
        record,
        (payload) => createCallable(functions, 'updateRecord')(payload),
      );
      if (currentScope.current === scope && done) setFinishSuccess(true);
    } catch (failure) {
      if (currentScope.current === scope)
        setFinishError(
          failure &&
            typeof failure === 'object' &&
            'code' in failure &&
            failure.code === 'functions/aborted'
            ? 'Registro alterado por outra operação. Confira os dados atualizados antes de finalizar novamente.'
            : 'Não foi possível finalizar. Tente novamente para reenviar a mesma solicitação com segurança.',
        );
    } finally {
      if (currentScope.current === scope) {
        mutationBusy.current = false;
        setFinishing(false);
      }
    }
  }
  async function save() {
    if (
      mutationBusy.current ||
      !record ||
      !confirmed ||
      finishing ||
      saving ||
      moving ||
      moveOpen
    )
      return;
    mutationBusy.current = true;
    setError('');
    setSuccess('');
    try {
      const endedAt = removeEnd
        ? null
        : validateEnd(localEndToIso(end.trim()), record.startedAt);
      if (!reason.trim()) throw new Error('Informe o motivo da alteração.');
      const key = JSON.stringify({ recordId, endedAt, reason: reason.trim() });
      if (intent.current?.key !== key)
        intent.current = {
          key,
          requestId: crypto.randomUUID(),
          expectedUpdatedAt:
            typeof record.updatedAt === 'string' ? record.updatedAt : null,
        };
      const currentIntent = intent.current;
      setSaving(true);
      const callable = createCallable<
        {
          recordId: string;
          endedAt: string | null;
          reason: string;
          expectedUpdatedAt: string | null;
          requestId: string;
        },
        { recordId: string; updatedAt: string; auditId: string }
      >(functions, 'updateRecord');
      const result = await callable({
        recordId,
        endedAt,
        reason: reason.trim(),
        expectedUpdatedAt: currentIntent.expectedUpdatedAt,
        requestId: currentIntent.requestId,
      });
      setSuccess(
        'Alteração salva com auditoria em ' + date(result.data.updatedAt) + '.',
      );
      setConfirmed(false);
      setReason('');
      intent.current = null;
      setRemoveEnd(false);
    } catch (failure) {
      if (
        failure &&
        typeof failure === 'object' &&
        'code' in failure &&
        failure.code === 'functions/aborted'
      ) {
        intent.current = null;
        setConfirmed(false);
        setError(
          'Registro alterado por outra operação. Confira os dados atualizados e confirme novamente antes de salvar.',
        );
      } else
        setError(
          failure instanceof Error ? failure.message : 'Falha ao salvar.',
        );
    } finally {
      mutationBusy.current = false;
      setSaving(false);
    }
  }
  const movementSide = (side: unknown) => {
    const snapshot = object(side);
    const parent = projects.rows.find((p) => p.id === snapshot.projectId)?.data;
    if (!revealed && (!parent || isHidden(parent, revealed)))
      return 'Projeto reservado · Tópicos reservados';
    return (
      text(object(snapshot.projectSnapshot).title, 'Projeto') +
      ' · ' +
      objects(snapshot.topicSnapshots)
        .map((t) => text(t.title, 'Tópico'))
        .join(', ')
    );
  };
  const content = (
    <div
      className={
        presentation === 'page'
          ? 'flex w-full flex-col break-words p-4 sm:p-6'
          : 'flex h-full min-h-0 w-full flex-col overflow-hidden break-words p-4 sm:p-6'
      }
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={'registro-titulo'} className="text-lg font-semibold">
          Detalhes do registro
        </h2>
        <Button
          aria-label={'Fechar'}
          disabled={finishing || saving || moving || moveOpen || removing}
          onClick={close}
          variant="ghost"
          size="icon"
          className="shrink-0"
        >
          <UiIcon kind={'close'} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {loading && (
          <div
            aria-label={'Carregando registro'}
            role="status"
            className="my-4 animate-pulse text-sm text-muted-foreground"
          >
            Carregando…
          </div>
        )}
        {error && revealed && (
          <Alert variant="destructive" className="my-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!loading && !record && !error && (
          <Alert className="my-2">
            <AlertDescription>
              Registro não disponível nesta conta.
            </AlertDescription>
          </Alert>
        )}
        {success && revealed && (
          <Alert role="status" className="my-2">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}
        {record &&
          isHidden(
            projects.rows.find((item) => item.id === record.projectId)?.data,
            revealed,
          ) && (
            <Alert className="my-2">
              <AlertDescription>
                Detalhes, edição e auditoria ocultos no apresentação com dados
                ocultos. Revele dados no topo para continuar.
              </AlertDescription>
            </Alert>
          )}
        {record &&
          !isHidden(
            projects.rows.find((item) => item.id === record.projectId)?.data,
            revealed,
          ) && (
            <>
              <p className="text-lg font-semibold">
                {text(
                  object(record.projectSnapshot).title,
                  text(record.projectId),
                )}
              </p>
              <p className="text-sm leading-relaxed">
                {date(record.startedAt, 'America/Sao_Paulo')}—{' '}
                {record.endedAt
                  ? date(record.endedAt, 'America/Sao_Paulo')
                  : 'Aberto'}
              </p>
              {removeError && (
                <Alert variant="destructive" role="alert" className="my-2">
                  <AlertDescription>{removeError}</AlertDescription>
                </Alert>
              )}
              {finishError && (
                <Alert variant="destructive" className="my-2">
                  <AlertDescription>{finishError}</AlertDescription>
                </Alert>
              )}
              {finishSuccess && (
                <Alert role="status" className="my-2">
                  <AlertDescription>
                    Registro finalizado. Os dados e o histórico serão
                    atualizados automaticamente.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
                {!finishSuccess && canFinishNow(record, uid) && (
                  <Button
                    disabled={
                      finishing || saving || moving || moveOpen || removing
                    }
                    onClick={finishNow}
                    variant="default"
                    className="min-h-11"
                  >
                    {finishing
                      ? 'Finalizando…'
                      : finishError
                        ? 'Tentar finalizar novamente'
                        : 'Finalizar agora'}
                  </Button>
                )}
                {record.uid === uid &&
                  (record.deletedAt === null ||
                    record.deletedAt === undefined) && (
                    <Button
                      disabled={
                        saving || finishing || moving || moveOpen || removing
                      }
                      onClick={() => setMoveOpen(true)}
                      variant="outline"
                      className="min-h-11"
                    >
                      Mover registro
                    </Button>
                  )}
                {record.uid === uid && !isDeletedRecord(record) && (
                  <Button
                    disabled={
                      saving || finishing || moving || moveOpen || removing
                    }
                    onClick={removeRecord}
                    variant="destructive"
                    className="min-h-11"
                  >
                    {removing ? 'Removendo…' : 'Remover registro'}
                  </Button>
                )}
              </div>
              {moveOpen && (
                <MoveDialog
                  key={uid + '/' + recordId}
                  functions={functions}
                  uid={uid}
                  projectId={String(record.projectId)}
                  recordId={recordId}
                  recordOwnerUid={
                    record.uid !== uid ? String(record.uid) : undefined
                  }
                  originLabel={
                    text(object(record.projectSnapshot).title) +
                    ' · ' +
                    date(record.startedAt)
                  }
                  mutationBusy={mutationBusy}
                  onBusyChange={setMoving}
                  onClose={() => setMoveOpen(false)}
                />
              )}
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="my-4"
              >
                <TabsList
                  className="grid w-full grid-cols-3"
                  aria-label={'Seções do registro'}
                >
                  <TabsTrigger
                    id={'record-tab-details'}
                    aria-controls={'record-panel-details'}
                    value={'details'}
                  >
                    {'Detalhes'}
                  </TabsTrigger>
                  <TabsTrigger
                    id={'record-tab-edit'}
                    aria-controls={'record-panel-edit'}
                    value={'edit'}
                  >
                    {'Editar'}
                  </TabsTrigger>
                  <TabsTrigger
                    id={'record-tab-history'}
                    aria-controls={'record-panel-history'}
                    value={'history'}
                  >
                    {'Histórico'}
                  </TabsTrigger>
                </TabsList>
                <div
                  role={'tabpanel'}
                  id={'record-panel-details'}
                  aria-labelledby={'record-tab-details'}
                  hidden={!detailsOpen}
                >
                  <dl className="[&_dt]:mt-4 [&_dt]:font-semibold [&_dd]:m-0 [&_dd]:whitespace-pre-wrap">
                    <dt>ID</dt>
                    <dd>{recordId}</dd>
                    <dt>Projeto</dt>
                    <dd>
                      {text(
                        object(record.projectSnapshot).title,
                        text(record.projectId),
                      )}
                    </dd>
                    <dt>Tópicos</dt>
                    <dd>
                      {objects(record.topicSnapshots)
                        .map((topic) => text(topic.title))
                        .join(', ') || 'Não informado'}
                    </dd>
                    <dt>Início original</dt>
                    <dd>{date(record.startedAt, 'America/Sao_Paulo')}</dd>
                    <dt>Fim atualmente registrado</dt>
                    <dd>{date(record.endedAt, 'America/Sao_Paulo')}</dd>
                    <dt>Texto original</dt>
                    <dd>{text(record.originalText)}</dd>
                    <dt>Contexto</dt>
                    <dd>{text(record.interpretation)}</dd>
                    <dt>Gravado em</dt>
                    <dd>{date(record.recordedAt)}</dd>
                  </dl>
                </div>
                <div
                  role={'tabpanel'}
                  id={'record-panel-edit'}
                  aria-labelledby={'record-tab-edit'}
                  hidden={!editOpen}
                >
                  <form
                    id={'record-edit-form'}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save();
                    }}
                    className="rounded-xl border bg-card p-4 text-card-foreground"
                  >
                    <h3 className="text-lg font-semibold">Editar fim</h3>
                    <div className="flex flex-col gap-4">
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor={'RecordDrawer-17410'}>
                          {'Fim efetivo'}
                        </Label>
                        <Input
                          autoFocus={focusEnd}
                          type={'datetime-local'}
                          value={end}
                          disabled={
                            finishing ||
                            saving ||
                            moving ||
                            moveOpen ||
                            removeEnd
                          }
                          onChange={(event) => {
                            editorDirty.current = true;
                            setEnd(event.target.value);
                            setConfirmed(false);
                          }}
                          id={'RecordDrawer-17410'}
                          aria-describedby={'RecordDrawer-17410-help'}
                        ></Input>
                        <p
                          id="RecordDrawer-17410-help"
                          className="text-xs text-muted-foreground"
                        >
                          {
                            'Informe a data e hora efetivas. Nenhum horário é preenchido automaticamente.'
                          }
                        </p>
                      </div>
                      {!!record.endedAt && (
                        <>
                          <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                            <Checkbox
                              checked={removeEnd}
                              disabled={
                                finishing ||
                                saving ||
                                moving ||
                                moveOpen ||
                                removing
                              }
                              onCheckedChange={(checked) => {
                                editorDirty.current = true;
                                setRemoveEnd(checked === true);
                                setConfirmed(false);
                              }}
                            />
                            <span>
                              {'Remover fim e reabrir explicitamente'}
                            </span>
                          </Label>
                        </>
                      )}
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor={'RecordDrawer-19047'}>
                          {'Motivo da alteração'}
                        </Label>
                        <Textarea
                          value={reason}
                          disabled={
                            finishing ||
                            saving ||
                            moving ||
                            moveOpen ||
                            removing
                          }
                          onChange={(event) => setReason(event.target.value)}
                          required={true}
                          id={'RecordDrawer-19047'}
                          rows={2}
                          maxLength={1000}
                        ></Textarea>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {removeEnd
                          ? 'Reabrir explicitamente'
                          : 'Fim efetivo: ' + (end || 'não informado')}
                      </p>
                      <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                        <Checkbox
                          checked={confirmed}
                          disabled={
                            finishing ||
                            saving ||
                            moving ||
                            moveOpen ||
                            removing
                          }
                          onCheckedChange={(checked) =>
                            setConfirmed(checked === true)
                          }
                        />
                        <span>
                          {'Confirmo o horário e esta alteração explícita'}
                        </span>
                      </Label>
                    </div>
                  </form>
                </div>
                <div
                  role={'tabpanel'}
                  id={'record-panel-history'}
                  aria-labelledby={'record-tab-history'}
                  hidden={!(activeTab === 'history')}
                >
                  {!revealed ? (
                    <Alert className="my-2">
                      <AlertDescription>
                        Auditoria oculta na apresentação atual, pois pode conter
                        referências históricas confidenciais.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold">
                        Histórico de auditoria
                      </h3>
                      <p className="text-sm">
                        Até 20 eventos disponíveis; ordem não representa os mais
                        recentes.
                      </p>
                      {audit.loading ? (
                        <div
                          aria-label={'Carregando auditoria'}
                          role="status"
                          className="my-4 animate-pulse text-sm text-muted-foreground"
                        >
                          Carregando…
                        </div>
                      ) : audit.error ? (
                        <Alert variant="destructive" className="my-2">
                          <AlertDescription>
                            {audit.error}
                            {
                              <Button onClick={audit.retry}>
                                Tentar novamente
                              </Button>
                            }
                          </AlertDescription>
                        </Alert>
                      ) : audit.rows.length === 0 ? (
                        <p className="text-sm leading-relaxed">
                          Nenhuma alteração auditada disponível.
                        </p>
                      ) : (
                        audit.rows.map((row) => (
                          <div
                            key={row.id}
                            className="rounded-xl border bg-card p-4 text-card-foreground"
                          >
                            <p className="text-sm leading-relaxed">
                              {date(row.data.updatedAt)}·{' '}
                              {text(row.data.reason)}
                            </p>
                            <p className="text-sm">Autor: Pessoa</p>
                            <p className="text-sm">
                              {[
                                'move_topic',
                                'move_subject',
                                'move_record',
                              ].includes(String(row.data.action)) && (
                                <>
                                  Ação:{' '}
                                  {row.data.action !== 'move_record'
                                    ? 'Transferência de tópico'
                                    : 'Mover registro'}
                                  <br />
                                  Origem: {movementSide(row.data.before)}
                                  <br />
                                  Destino: {movementSide(row.data.after)}
                                  <br />
                                </>
                              )}
                              Fim antes: {text(object(row.data.before).endedAt)}
                              <br />
                              Fim depois: {text(object(row.data.after).endedAt)}
                            </p>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              </Tabs>
            </>
          )}
      </div>
      {editOpen &&
        record &&
        !isHidden(
          projects.rows.find((item) => item.id === record.projectId)?.data,
          revealed,
        ) && (
          <div className="shrink-0 border-t bg-background pt-3 pb-[var(--emulator-inset,0px)]">
            <Button
              type={'submit'}
              form={'record-edit-form'}
              disabled={
                finishing ||
                saving ||
                moving ||
                moveOpen ||
                removing ||
                !confirmed
              }
              variant="default"
              className="min-h-11 w-full"
            >
              {saving ? 'Salvando…' : 'Salvar alteração'}
            </Button>
          </div>
        )}
    </div>
  );
  if (presentation === 'page') return content;
  if (presentation === 'dialog')
    return (
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open)
            (() => {
              if (!saving && !finishing) close();
            })();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          aria-labelledby={'registro-titulo'}
          className="flex h-[100dvh] max-h-[100dvh] w-screen flex-col gap-0 rounded-none p-0 sm:h-[85dvh] sm:max-h-[85dvh] sm:max-w-xl sm:rounded-lg"
        >
          <DialogTitle className="sr-only">Detalhes do registro</DialogTitle>
          {content}
        </DialogContent>
      </Dialog>
    );
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open)
          (() => {
            if (!saving && !finishing) close();
          })();
      }}
    >
      <SheetContent
        aria-describedby={undefined}
        showCloseButton={false}
        side="right"
        className="flex h-full w-full flex-col p-0 sm:max-w-[560px]"
      >
        <SheetTitle className="sr-only">Detalhes do registro</SheetTitle>
        {content}
      </SheetContent>
    </Sheet>
  );
}
