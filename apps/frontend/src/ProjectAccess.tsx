import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { httpsCallable, type Functions } from 'firebase/functions';
import { projectRepository } from './project-repository';
import {
  scopeDisabledReason,
  scopeConfirmation,
  type ProjectScope,
  type ScopePreview,
} from './project-access';
import './project-access-revision';
export function ProjectAccess({
  functions,
  projectId,
  project,
  uid,
  hidden,
}: {
  functions: Functions;
  projectId: string;
  project?: Record<string, unknown>;
  uid: string;
  hidden: boolean;
}) {
  if (hidden)
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        Acesso e apresentação ocultos. Revele os dados no topo para gerenciar
        este projeto. Confidencialidade não restringe acesso.
      </Alert>
    );
  if (!project) return null;
  return (
    <AccessForm
      key={uid + '/' + projectId}
      {...{ functions, projectId, project, uid }}
    />
  );
}
function AccessForm({
  functions,
  projectId,
  project,
  uid,
}: {
  functions: Functions;
  projectId: string;
  project: Record<string, unknown>;
  uid: string;
}) {
  const [target, setTarget] = useState<ProjectScope | null>(null);
  const [preview, setPreview] = useState<ScopePreview | null>(null);
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState('');
  const [confidentialTarget, setConfidentialTarget] = useState<boolean | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const busyRef = useRef(false);
  const scopeIntent = useRef<{
    projectId: string;
    type: ProjectScope;
    requestId: string;
    reason: string;
  } | null>(null);
  const confidentialIntent = useRef<{
    projectId: string;
    confidential: boolean;
    reason: string;
    requestId: string;
  } | null>(null);
  const disabledReason = scopeDisabledReason(project, uid);
  const scope =
    project.type === 'personal'
      ? 'personal'
      : project.type === 'work' || project.type === undefined
        ? 'work'
        : '';
  const confidential = project.confidential === true;
  async function changeScope(execute: boolean) {
    if (busyRef.current || !target || disabledReason) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (!reason.trim()) throw Error('Informe o motivo da alteração.');
      const next = { projectId, type: target, reason: reason.trim() };
      if (
        !scopeIntent.current ||
        scopeIntent.current.type !== target ||
        scopeIntent.current.reason !== next.reason
      )
        scopeIntent.current = { ...next, requestId: crypto.randomUUID() };
      const intent = scopeIntent.current;
      const payload = execute
        ? scopeConfirmation(intent, preview!, ack)
        : { ...intent, confirmed: false };
      const result = await httpsCallable(
        functions,
        'changeProjectScope',
      )(payload);
      if (execute) {
        projectRepository.invalidate();
        setMessage('Escopo atualizado com auditoria.');
        setTarget(null);
        setPreview(null);
        scopeIntent.current = null;
      } else {
        const response = result.data as ScopePreview;
        if (
          response.mode !== 'preview' ||
          response.projectId !== projectId ||
          response.toType !== target
        )
          throw Error('Prévia inválida. Tente novamente.');
        setPreview(response);
        setAck(false);
      }
    } catch (failure) {
      const code =
        failure && typeof failure === 'object' && 'code' in failure
          ? failure.code
          : '';
      if (code === 'functions/failed-precondition') {
        setPreview(null);
        setAck(false);
      }
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível alterar o escopo. Confira a prévia novamente.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function changeConfidential() {
    if (busyRef.current || confidentialTarget === null) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (
        !confidentialIntent.current ||
        confidentialIntent.current.confidential !== confidentialTarget
      )
        confidentialIntent.current = {
          projectId,
          confidential: confidentialTarget,
          requestId: crypto.randomUUID(),
          reason: confidentialTarget
            ? 'Usuário marcou o projeto como confidencial na apresentação.'
            : 'Usuário removeu a confidencialidade de apresentação do projeto.',
        };
      await httpsCallable(
        functions,
        'updateProject',
      )(confidentialIntent.current);
      projectRepository.invalidate();
      setMessage('Apresentação atualizada com auditoria.');
      setConfidentialTarget(null);
      confidentialIntent.current = null;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível atualizar. Tente novamente com segurança.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const close = () => {
    if (busy) return;
    scopeIntent.current = null;
    confidentialIntent.current = null;
    setTarget(null);
    setPreview(null);
    setAck(false);
    setConfidentialTarget(null);
    setError('');
  };
  return (
    <Paper
      component="section"
      aria-label="Acesso e apresentação"
      variant="outlined"
      sx={{ p: 2, mt: 2, borderRadius: 3 }}
    >
      <Typography component="h3" variant="subtitle1" sx={{ mb: 1.5 }}>
        Acesso e apresentação
      </Typography>
      {message && (
        <Alert severity="success" sx={{ mb: 1.5 }}>
          {message}
        </Alert>
      )}
      {error && !target && confidentialTarget === null && (
        <Alert severity="error">{error}</Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          size="small"
          label="Escopo"
          value={scope}
          disabled={busy || !!disabledReason}
          onChange={(e) => {
            setTarget(e.target.value as ProjectScope);
            setReason('');
            setPreview(null);
            setAck(false);
            setError('');
            scopeIntent.current = null;
          }}
          helperText={
            disabledReason ||
            (scope === 'personal'
              ? 'Somente você'
              : 'Pessoas autorizadas da organização; não é público na internet.')
          }
          sx={{ flex: 1, minWidth: 0, '& .MuiInputBase-root': { height: 44 } }}
        >
          <MenuItem value="">Não identificado</MenuItem>
          <MenuItem value="personal">Pessoal</MenuItem>
          <MenuItem value="work">
            {project.type === undefined
              ? 'Global · organização (legado)'
              : 'Global · organização'}
          </MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Apresentação"
          value={String(confidential)}
          disabled={busy}
          onChange={(e) => {
            setConfidentialTarget(e.target.value === 'true');
            setError('');
            confidentialIntent.current = null;
          }}
          helperText="Oculta dados na apresentação; não restringe acesso."
          sx={{ flex: 1, minWidth: 0, '& .MuiInputBase-root': { height: 44 } }}
        >
          <MenuItem value="true">Confidencial</MenuItem>
          <MenuItem value="false">Não confidencial</MenuItem>
        </TextField>
      </Stack>
      <Dialog
        open={target !== null}
        onClose={close}
        fullWidth
        maxWidth="sm"
        aria-labelledby="scope-dialog-title"
      >
        <DialogTitle id="scope-dialog-title">
          Alterar escopo do projeto
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              {String(project.title ?? 'Projeto')} ·{' '}
              {scope === 'personal' ? 'Pessoal' : 'Global'} →{' '}
              {target === 'personal' ? 'Pessoal' : 'Global · organização'}
            </Typography>
            <Alert severity="warning">
              {target === 'work'
                ? 'Global compartilha o projeto, tópicos, textos dos registros e histórico de auditoria com pessoas autorizadas da organização. Não é público na internet. Confidencialidade não impede esse acesso.'
                : 'Pessoal limita o acesso ao criador. A operação será bloqueada se houver registros de outras pessoas, inclusive históricos removidos.'}
            </Alert>
            <TextField
              label="Motivo da alteração"
              value={reason}
              disabled={busy || !!preview}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
            {preview && (
              <>
                <Typography>
                  Prévia: {preview.recordCount} registros associados. Nenhum
                  horário, texto ou autoria será reescrito.
                </Typography>
                {preview.warnings.map((warning, index) => (
                  <Alert key={index} severity="warning">
                    {warning}
                  </Alert>
                ))}
                {preview.requiresSharingAcknowledgement && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={ack}
                        disabled={busy}
                        onChange={(e) => setAck(e.target.checked)}
                      />
                    }
                    label="Entendo e autorizo compartilhar todos esses dados com a organização."
                  />
                )}
              </>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            '& .MuiButton-root': { minHeight: 44 },
            flexWrap: 'wrap',
            gap: 1,
            p: 2,
          }}
        >
          <Button disabled={busy} onClick={close}>
            Cancelar
          </Button>
          {preview ? (
            <Button
              variant="contained"
              disabled={
                busy || (preview.requiresSharingAcknowledgement && !ack)
              }
              onClick={() => void changeScope(true)}
            >
              {busy
                ? 'Atualizando…'
                : target === 'work'
                  ? 'Confirmar mudança para Global'
                  : 'Confirmar mudança para Pessoal'}
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={busy || !reason.trim()}
              onClick={() => void changeScope(false)}
            >
              {busy ? 'Consultando…' : 'Conferir prévia'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={confidentialTarget !== null}
        onClose={close}
        fullWidth
        maxWidth="xs"
        aria-labelledby="confidential-dialog-title"
      >
        <DialogTitle id="confidential-dialog-title">
          {confidentialTarget
            ? 'Marcar como confidencial?'
            : 'Remover confidencialidade?'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            Esta opção oculta dados na apresentação e não altera quem tem acesso
            ao projeto. A mudança será auditada com motivo automático.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ '& .MuiButton-root': { minHeight: 44 } }}>
          <Button disabled={busy} onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => void changeConfidential()}
          >
            {busy ? 'Atualizando…' : 'Confirmar apresentação'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
