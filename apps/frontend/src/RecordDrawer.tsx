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
import { useNavigate } from 'react-router-dom';
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
  const [activeTab, setActiveTab] = useState(focusEnd ? 'edit' : 'details');
  const editOpen = activeTab === 'edit';
  const detailsOpen = activeTab === 'details';
  const mobile = useMediaQuery('(max-width:600px)');
  const close = () => (onClose ? onClose() : navigate(closePath));
  const requestedReturn = new URLSearchParams(search).get('returnTo');
  const closePath = requestedReturn
    ? safeReturnTo(requestedReturn)
    : '/records' + search;
  const { revealed } = usePrivacy();
  const projects = useRows(db, 'projects');
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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
    setLoading(true);
    setError('');
    return onSnapshot(
      doc(db, 'users', uid, 'records', recordId),
      (snapshot) => {
        const data = snapshot.exists()
          ? (snapshot.data() as Record<string, unknown>)
          : null;
        setRecord(data);
        setLoading(false);
        if (data) {
          setEnd(endToLocal(data.endedAt));
          setConfirmed(false);
        }
      },
      () => {
        setLoading(false);
        setError('Não foi possível consultar este registro privado.');
      },
    );
  }, [db, uid, recordId]);
  async function save() {
    if (!record || !confirmed) return;
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
      setSaving(false);
    }
  }
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
        paddingBottom:
          presentation === 'page'
            ? undefined
            : 'calc(16px + var(--emulator-inset, 0px))',
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
        <IconButton aria-label="Fechar" disabled={saving} onClick={close}>
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
              Detalhes, edição e auditoria ocultos no modo seguro. Revele dados
              no topo para continuar.
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
                      disabled={saving || removeEnd}
                      onChange={(event) => {
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
                              disabled={saving}
                              onChange={(event) => {
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
                      disabled={saving}
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
                          disabled={saving}
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
                    Auditoria oculta no modo seguro, pois pode conter
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
                          <Typography variant="body2">
                            Autor: {text(row.data.authorUid)}
                          </Typography>
                          <Typography variant="body2">
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
              disabled={saving || !confirmed}
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
        onClose={() => {
          if (!saving) close();
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
        if (!saving) close();
      }}
    >
      {content}
    </Drawer>
  );
}
