import { createWebCommand as createCallable } from '../../infrastructure/firebase/web-command-gateway';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { TabsTrigger, Tabs, TabsList } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '../../components/ui/sheet';
import { RecordEditorForm } from './RecordEditorForm';
import { RecordAuditEvent } from './RecordAuditEvent';
import { RecordDetails } from './RecordDetails';
import { Trash2 } from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '../../components/ui/tooltip';
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
    if (mutationBusy.current) return;
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
  const editorVersion = useRef<string | null>(null);
  const mutationBusy = useRef(false);
  const [editedProject, setEditedProject] = useState('');
  const [sharingAck, setSharingAck] = useState(false);
  const currentScope = useRef(uid + '/' + recordId);
  currentScope.current = uid + '/' + recordId;
  const [end, setEnd] = useState('');
  const [start, setStart] = useState('');
  const [description, setDescription] = useState('');
  const [editedTopics, setEditedTopics] = useState<
    Array<{ topicId: string; percentage?: number; durationMinutes?: number }>
  >([]);
  const reason = 'Edição de registro pela interface web.';
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
    setEditedProject('');
    setSharingAck(false);
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
          editorVersion.current =
            typeof activeRecord.updatedAt === 'string'
              ? activeRecord.updatedAt
              : null;
          setEditedProject(text(activeRecord.projectId, ''));
          setSharingAck(false);
          setEnd(endToLocal(activeRecord.endedAt));
          setStart(endToLocal(activeRecord.startedAt));
          setDescription(text(activeRecord.interpretation));
          setEditedTopics(
            objects(activeRecord.topics).map((t) => ({
              topicId: text(t.topicId),
              ...(typeof t.percentage === 'number'
                ? { percentage: t.percentage }
                : {}),
              ...(typeof t.durationMinutes === 'number'
                ? { durationMinutes: t.durationMinutes }
                : {}),
            })),
          );
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
    if (mutationBusy.current || !record || record.uid !== uid) return;
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
    if (mutationBusy.current) return;
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
  const originProject = projects.rows.find(
    (p) => p.id === record?.projectId,
  )?.data;
  const destinationProject = projects.rows.find(
    (p) => p.id === editedProject,
  )?.data;
  const requiresSharing =
    originProject?.type === 'personal' &&
    editedProject !== record?.projectId &&
    destinationProject &&
    destinationProject.type !== 'personal';
  async function save() {
    if (mutationBusy.current || !record || finishing || saving || removing)
      return;
    mutationBusy.current = true;
    setError('');
    setSuccess('');
    try {
      const startedAt =
        start.trim() === endToLocal(record.startedAt)
          ? String(record.startedAt)
          : localEndToIso(start.trim());
      const endedAt = end.trim()
        ? validateEnd(
            end.trim() === endToLocal(record.endedAt)
              ? String(record.endedAt)
              : localEndToIso(end.trim()),
            startedAt,
          )
        : null;
      if (!editedTopics.length)
        throw new Error('Selecione pelo menos um tópico.');
      if (
        !editedProject ||
        isHidden(
          projects.rows.find((p) => p.id === editedProject)?.data,
          revealed,
        )
      )
        throw new Error('Selecione um projeto autorizado e visível.');
      if (requiresSharing && !sharingAck)
        throw new Error('Autorize o compartilhamento com a organização.');

      const key = JSON.stringify({
        recordId,
        projectId: editedProject,
        acknowledgeSharedDestination: !!requiresSharing && sharingAck,
        startedAt,
        interpretation: description,
        topics: editedTopics,
        endedAt,
        reason: reason.trim(),
      });
      if (intent.current?.key !== key)
        intent.current = {
          key,
          requestId: crypto.randomUUID(),
          expectedUpdatedAt: editorVersion.current,
        };
      const currentIntent = intent.current;
      setSaving(true);
      const callable = createCallable<
        {
          recordId: string;
          projectId: string;
          acknowledgeSharedDestination: boolean;
          endedAt: string | null;
          startedAt: string;
          interpretation: string;
          topics: Array<{
            topicId: string;
            percentage?: number;
            durationMinutes?: number;
          }>;
          reason: string;
          expectedUpdatedAt: string | null;
          requestId: string;
        },
        { recordId: string; updatedAt: string; auditId: string }
      >(functions, 'updateRecord');
      const result = await callable({
        recordId,
        projectId: editedProject,
        acknowledgeSharedDestination: !!requiresSharing && sharingAck,
        endedAt,
        startedAt,
        interpretation: description,
        topics: editedTopics,
        reason: reason.trim(),
        expectedUpdatedAt: currentIntent.expectedUpdatedAt,
        requestId: currentIntent.requestId,
      });
      setSuccess(
        'Alteração salva com auditoria em ' + date(result.data.updatedAt) + '.',
      );
      editorDirty.current = false;
      editorVersion.current = result.data.updatedAt;
      intent.current = null;
      setSharingAck(false);
    } catch (failure) {
      if (
        failure &&
        typeof failure === 'object' &&
        'code' in failure &&
        failure.code === 'functions/aborted'
      ) {
        intent.current = null;
        editorVersion.current =
          typeof record.updatedAt === 'string' ? record.updatedAt : null;
        setError(
          'Registro alterado por outra operação. Confira os dados atualizados e revise a edição antes de salvar novamente.',
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
          disabled={finishing || saving || removing}
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
        {error && (!record || !isHidden(originProject, revealed)) && (
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
        {success && !isHidden(originProject, revealed) && (
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
                Detalhes, edição e auditoria ocultos na apresentação com dados
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
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="my-4"
              >
                <div
                  className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2"
                  aria-label="Seções do registro e ações"
                >
                  <TabsList
                    className="h-9 w-auto"
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
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {!finishSuccess && canFinishNow(record, uid) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={finishing || saving || removing}
                        onClick={finishNow}
                      >
                        {finishing ? 'Finalizando…' : 'Finalizar agora'}
                      </Button>
                    )}
                    {record.uid === uid && !isDeletedRecord(record) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 text-muted-foreground hover:text-destructive"
                            aria-label="Remover registro"
                            disabled={finishing || saving || removing}
                            onClick={removeRecord}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remover registro</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
                <div
                  role={'tabpanel'}
                  id={'record-panel-details'}
                  aria-labelledby={'record-tab-details'}
                  hidden={!detailsOpen}
                >
                  {detailsOpen && (
                    <RecordDetails
                      record={record}
                      recordId={recordId}
                      project={originProject}
                      revealed={revealed}
                    />
                  )}
                </div>
                <div
                  role={'tabpanel'}
                  id={'record-panel-edit'}
                  aria-labelledby={'record-tab-edit'}
                  hidden={!editOpen}
                >
                  {editOpen && (
                    <RecordEditorForm
                      key={uid + String(revealed)}
                      catalog={projects.rows}
                      revealed={revealed}
                      projectId={editedProject}
                      topics={editedTopics}
                      start={start}
                      end={end}
                      description={description}
                      busy={saving || finishing || removing}
                      focusEnd={focusEnd}
                      sharing={!!requiresSharing}
                      ack={sharingAck}
                      onProject={(id) => {
                        editorDirty.current = true;
                        setEditedProject(id);
                        setEditedTopics([]);
                        setSharingAck(false);
                      }}
                      onTopics={(value) => {
                        editorDirty.current = true;
                        setEditedTopics(value);
                      }}
                      onStart={(value) => {
                        editorDirty.current = true;
                        setStart(value);
                      }}
                      onEnd={(value) => {
                        editorDirty.current = true;
                        setEnd(value);
                      }}
                      onDescription={(value) => {
                        editorDirty.current = true;
                        setDescription(value);
                      }}
                      onAck={setSharingAck}
                      onSave={() => void save()}
                    />
                  )}
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
                        <div className="mt-4 space-y-3">
                          {audit.rows.map((row) => (
                            <RecordAuditEvent key={row.id} event={row.data} />
                          ))}
                        </div>
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
          <div className="flex shrink-0 justify-end border-t bg-background pt-3 pb-[var(--emulator-inset,0px)]">
            <Button
              type={'submit'}
              form={'record-edit-form'}
              disabled={
                finishing ||
                saving ||
                removing ||
                !editedTopics.length ||
                (requiresSharing && !sharingAck)
              }
              variant="default"
              className="min-h-11"
            >
              {saving ? 'Salvando…' : 'Salvar'}
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
