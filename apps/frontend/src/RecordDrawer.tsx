import { MoveDialog } from './MoveDialog';
import { useProjects } from './useProjects';
import { canFinishNow, createFinishNowCommand } from './finish-now';
import { isDeletedRecord, createDeletionObserver } from './record-deletion';
import { writeUrlTab } from './url-tabs';
import { UiIcon } from './UiIcons';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  Dialog,
  Collapse,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
  Tabs,
  Tab,
  IconButton,
  useMediaQuery,
} from '@mui/material';
import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { date, object, objects, text, useRows } from './data';
import { validateEnd, localEndToIso, endToLocal } from './record-edit';
import { safeReturnTo } from './routes';
import { usePrivacy, isHidden } from './privacy';

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
  const mobile = useMediaQuery('(max-width:600px)');
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
        (payload) => httpsCallable(functions, 'updateRecord')(payload),
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
      const callable = httpsCallable<
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
      return 'Projeto reservado · Assuntos reservados';
    return (
      text(object(snapshot.projectSnapshot).title, 'Projeto') +
      ' · ' +
      objects(snapshot.topicSnapshots)
        .map((t) => text(t.title, 'Assunto'))
        .join(', ')
    );
  };
  const content = (
    <Box
      role={presentation === 'drawer' ? 'dialog' : undefined}
      aria-modal={presentation === 'drawer' ? true : undefined}
      aria-labelledby="registro-titulo"
      sx={{
        width: presentation === 'drawer' ? { xs: '100vw', sm: 560 } : '100%',
        p: { xs: 2, sm: 3 },
        display: 'flex',
        flexDirection: 'column',
        height: presentation === 'page' ? 'auto' : '100%',

        overflow: 'hidden',
        overflowWrap: 'anywhere',
      }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography id="registro-titulo" component="h2" variant="h5">
          Detalhes do registro
        </Typography>
        <IconButton
          aria-label="Fechar"
          disabled={finishing || saving || moving || moveOpen}
          onClick={close}
        >
          <UiIcon kind="close" />
        </IconButton>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', py: 1 }}>
        {loading && (
          <CircularProgress aria-label="Carregando registro" sx={{ mt: 3 }} />
        )}
        {error && revealed && (
          <Alert severity="error" sx={{ my: 2 }}>
            {error}
          </Alert>
        )}
        {!loading && !record && !error && (
          <Alert severity="info">Registro não disponível nesta conta.</Alert>
        )}
        {success && revealed && (
          <Alert severity="success" role="status" sx={{ my: 2 }}>
            {success}
          </Alert>
        )}
        {record &&
          isHidden(
            projects.rows.find((item) => item.id === record.projectId)?.data,
            revealed,
          ) && (
            <Alert severity="info">
              Detalhes, edição e auditoria ocultos no apresentação com dados
              ocultos. Revele dados no topo para continuar.
            </Alert>
          )}
        {record &&
          !isHidden(
            projects.rows.find((item) => item.id === record.projectId)?.data,
            revealed,
          ) && (
            <>
              <Typography variant="h6">
                {text(
                  object(record.projectSnapshot).title,
                  text(record.projectId),
                )}
              </Typography>
              <Typography>
                {date(record.startedAt, 'America/Sao_Paulo')} —{' '}
                {record.endedAt
                  ? date(record.endedAt, 'America/Sao_Paulo')
                  : 'Aberto'}
              </Typography>
              {finishError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {finishError}
                </Alert>
              )}
              {finishSuccess && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  Registro finalizado. Os dados e o histórico serão atualizados
                  automaticamente.
                </Alert>
              )}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ mt: 1, flexWrap: 'wrap' }}
              >
                {!finishSuccess && canFinishNow(record, uid) && (
                  <Button
                    variant="contained"
                    disabled={finishing || saving || moving || moveOpen}
                    onClick={finishNow}
                    sx={{
                      mt: 1,
                      minHeight: 44,
                      width: { xs: '100%', sm: 'auto' },
                      alignSelf: 'flex-start',
                    }}
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
                      variant="outlined"
                      disabled={saving || finishing || moving || moveOpen}
                      sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' } }}
                      onClick={() => setMoveOpen(true)}
                    >
                      Mover registro
                    </Button>
                  )}
              </Stack>
              {moveOpen && (
                <MoveDialog
                  key={uid + '/' + recordId}
                  functions={functions}
                  uid={uid}
                  projectId={String(record.projectId)}
                  recordId={recordId}
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
                onChange={(_, value) => setActiveTab(value)}
                aria-label="Seções do registro"
                variant="fullWidth"
                sx={{ my: 2, borderBottom: 1, borderColor: 'divider' }}
              >
                <Tab
                  id="record-tab-details"
                  aria-controls="record-panel-details"
                  value="details"
                  label="Detalhes"
                />
                <Tab
                  id="record-tab-edit"
                  aria-controls="record-panel-edit"
                  value="edit"
                  label="Editar"
                />
                <Tab
                  id="record-tab-history"
                  aria-controls="record-panel-history"
                  value="history"
                  label="Histórico"
                />
              </Tabs>
              <Collapse
                role="tabpanel"
                id="record-panel-details"
                aria-labelledby="record-tab-details"
                in={detailsOpen}
              >
                <Box
                  component="dl"
                  sx={{
                    '& dt': { fontWeight: 700, mt: 2 },
                    '& dd': { m: 0, whiteSpace: 'pre-wrap' },
                  }}
                >
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
                </Box>
              </Collapse>
              <Collapse
                role="tabpanel"
                id="record-panel-edit"
                aria-labelledby="record-tab-edit"
                in={editOpen}
              >
                <Paper
                  component="form"
                  id="record-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                  sx={{ p: 0, my: 1, border: 0 }}
                >
                  <Typography component="h3" variant="h6" sx={{ mb: 2 }}>
                    Editar fim
                  </Typography>
                  <Stack spacing={2}>
                    <TextField
                      autoFocus={focusEnd}
                      type="datetime-local"
                      label="Fim efetivo"
                      slotProps={{ inputLabel: { shrink: true } }}
                      value={end}
                      disabled={
                        finishing || saving || moving || moveOpen || removeEnd
                      }
                      onChange={(event) => {
                        editorDirty.current = true;
                        setEnd(event.target.value);
                        setConfirmed(false);
                      }}
                      helperText="Informe a data e hora efetivas. Nenhum horário é preenchido automaticamente."
                      fullWidth
                    />
                    {!!record.endedAt && (
                      <>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={removeEnd}
                              disabled={
                                finishing || saving || moving || moveOpen
                              }
                              onChange={(event) => {
                                editorDirty.current = true;
                                setRemoveEnd(event.target.checked);
                                setConfirmed(false);
                              }}
                            />
                          }
                          label="Remover fim e reabrir explicitamente"
                        />
                      </>
                    )}
                    <TextField
                      label="Motivo da alteração"
                      value={reason}
                      disabled={finishing || saving || moving || moveOpen}
                      onChange={(event) => setReason(event.target.value)}
                      multiline
                      minRows={2}
                      slotProps={{ htmlInput: { maxLength: 1000 } }}
                      required
                    />
                    <Typography variant="caption" color="text.secondary">
                      {removeEnd
                        ? 'Reabrir explicitamente'
                        : 'Fim efetivo: ' + (end || 'não informado')}
                    </Typography>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={confirmed}
                          disabled={finishing || saving || moving || moveOpen}
                          onChange={(event) =>
                            setConfirmed(event.target.checked)
                          }
                        />
                      }
                      label="Confirmo o horário e esta alteração explícita"
                    />
                  </Stack>
                </Paper>
              </Collapse>
              <Collapse
                role="tabpanel"
                id="record-panel-history"
                aria-labelledby="record-tab-history"
                in={activeTab === 'history'}
              >
                {!revealed ? (
                  <Alert severity="info">
                    Auditoria oculta na apresentação atual, pois pode conter
                    referências históricas confidenciais.
                  </Alert>
                ) : (
                  <>
                    <Typography component="h3" variant="h6">
                      Histórico de auditoria
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Até 20 eventos disponíveis; ordem não representa os mais
                      recentes.
                    </Typography>
                    {audit.loading ? (
                      <CircularProgress aria-label="Carregando auditoria" />
                    ) : audit.error ? (
                      <Alert
                        severity="error"
                        action={
                          <Button onClick={audit.retry}>
                            Tentar novamente
                          </Button>
                        }
                      >
                        {audit.error}
                      </Alert>
                    ) : audit.rows.length === 0 ? (
                      <Typography>
                        Nenhuma alteração auditada disponível.
                      </Typography>
                    ) : (
                      audit.rows.map((row) => (
                        <Paper key={row.id} sx={{ p: 2, my: 2 }}>
                          <Typography>
                            {date(row.data.updatedAt)} · {text(row.data.reason)}
                          </Typography>
                          <Typography variant="body2">Autor: Pessoa</Typography>
                          <Typography variant="body2">
                            {['move_subject', 'move_record'].includes(
                              String(row.data.action),
                            ) && (
                              <>
                                Ação:{' '}
                                {row.data.action === 'move_subject'
                                  ? 'Transferência de assunto'
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
                          </Typography>
                        </Paper>
                      ))
                    )}
                  </>
                )}
              </Collapse>
            </>
          )}
      </Box>
      {editOpen &&
        record &&
        !isHidden(
          projects.rows.find((item) => item.id === record.projectId)?.data,
          revealed,
        ) && (
          <Box
            sx={{
              pt: 1.5,
              paddingBottom: 'var(--emulator-inset, 0px)',
              borderTop: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              flexShrink: 0,
            }}
          >
            <Button
              fullWidth
              type="submit"
              form="record-edit-form"
              variant="contained"
              disabled={finishing || saving || moving || moveOpen || !confirmed}
            >
              {saving ? 'Salvando…' : 'Salvar alteração'}
            </Button>
          </Box>
        )}
    </Box>
  );
  if (presentation === 'page') return content;
  if (presentation === 'dialog')
    return (
      <Dialog
        open
        fullWidth
        fullScreen={mobile}
        aria-labelledby="registro-titulo"
        maxWidth="sm"
        slotProps={{
          paper: {
            sx: {
              maxHeight: mobile ? '100%' : 'calc(100% - 64px)',
              height: mobile ? '100%' : undefined,
            },
          },
        }}
        onClose={() => {
          if (!saving && !finishing) close();
        }}
      >
        {content}
      </Dialog>
    );
  return (
    <Drawer
      anchor="right"
      open
      onClose={() => {
        if (!saving && !finishing) close();
      }}
    >
      {content}
    </Drawer>
  );
}
