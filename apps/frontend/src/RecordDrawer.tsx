import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { date, object, objects, text, useRows } from './data';
import { validateEnd } from './record-edit';
import { safeReturnTo } from './routes';
import { usePrivacy, isHidden } from './privacy';

export function RecordDrawer({
  db,
  functions,
  uid,
  recordId,
  search,
}: {
  db: Firestore;
  functions: Functions;
  uid: string;
  recordId: string;
  search: string;
}) {
  const navigate = useNavigate();
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
          setEnd(typeof data.endedAt === 'string' ? data.endedAt : '');
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
        : validateEnd(end.trim(), record.startedAt);
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
  return (
    <Drawer
      anchor="right"
      open
      onClose={() => {
        if (!saving) navigate(closePath);
      }}
    >
      <Box
        role="dialog"
        aria-modal="true"
        aria-labelledby="registro-titulo"
        sx={{ width: { xs: '100vw', sm: 560 }, p: 3, overflowWrap: 'anywhere' }}
      >
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Typography id="registro-titulo" component="h2" variant="h5">
            Detalhes do registro
          </Typography>
          <Button disabled={saving} onClick={() => navigate(closePath)}>
            Fechar
          </Button>
        </Stack>
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
              Detalhes, edição e auditoria ocultos no modo live. Revele dados no
              topo para continuar.
            </Alert>
          )}
        {record &&
          !isHidden(
            projects.rows.find((item) => item.id === record.projectId)?.data,
            revealed,
          ) && (
            <>
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
                <dd>{text(record.startedAt)}</dd>
                <dt>Fim original</dt>
                <dd>{text(record.endedAt)}</dd>
                <dt>Fuso da atividade</dt>
                <dd>{text(record.timeZone)}</dd>
                <dt>Texto original</dt>
                <dd>{text(record.originalText)}</dd>
                <dt>Contexto</dt>
                <dd>{text(record.interpretation)}</dd>
                <dt>Gravado em</dt>
                <dd>{date(record.recordedAt)} (fuso do navegador)</dd>
              </Box>
              {!record.endedAt && (
                <Alert severity="warning">
                  Registro aberto. Estimativas do relatório não encerram esta
                  atividade.
                </Alert>
              )}
              <Paper
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
                sx={{ p: 2, my: 3 }}
              >
                <Typography component="h3" variant="h6" sx={{ mb: 2 }}>
                  Editar fim
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    label="Fim com fuso (ISO 8601)"
                    value={end}
                    disabled={saving || removeEnd}
                    onChange={(event) => {
                      setEnd(event.target.value);
                      setConfirmed(false);
                    }}
                    helperText="Digite o instante efetivo com Z ou offset. Nenhum horário é preenchido automaticamente."
                    fullWidth
                  />
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
                  <Alert severity="info">
                    {removeEnd
                      ? 'Você irá remover o fim, tornando a atividade aberta.'
                      : 'Confira o fim e seu offset: ' +
                        (end || 'não informado')}
                    . Início, texto original e horário de gravação serão
                    preservados. Alteração registrada com autor e antes/depois.
                  </Alert>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={confirmed}
                        disabled={saving}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                    }
                    label="Confirmo o horário/fuso e esta alteração explícita"
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={saving || !confirmed}
                  >
                    {saving ? 'Salvando…' : 'Salvar alteração'}
                  </Button>
                </Stack>
              </Paper>
              {!revealed ? (
                <Alert severity="info">
                  Auditoria oculta no modo live, pois pode conter referências
                  históricas confidenciais.
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
                        <Button onClick={audit.retry}>Tentar novamente</Button>
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
            </>
          )}
      </Box>
    </Drawer>
  );
}
