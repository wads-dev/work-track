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
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { httpsCallable, type Functions } from 'firebase/functions';
import { useProjects } from './useProjects';
import { ProjectSelector } from './ProjectSelector';
import { safeProject, usePrivacy, isHidden } from './privacy';
import { text } from './data';
import { projectRepository } from './project-repository';
import { ownRecordsRepository } from './own-records-repository';
import { getAuth } from 'firebase/auth';
import {
  compatibleMoveProject,
  moveConfirmation,
  type MovePreview,
} from './record-movement';
export function MoveDialog({
  functions,
  uid,
  projectId,
  subjectId,
  recordId,
  originLabel,
  onClose,
  mutationBusy,
  onBusyChange,
}: {
  functions: Functions;
  uid: string;
  projectId: string;
  subjectId?: string;
  recordId?: string;
  originLabel: string;
  onClose: () => void;
  mutationBusy?: { current: boolean };
  onBusyChange?: (busy: boolean) => void;
}) {
  const projects = useProjects(functions, uid);
  const { revealed } = usePrivacy();
  const [target, setTarget] = useState('');
  const [topic, setTopic] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  const intent = useRef<{
    key: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const source = projects.rows.find((p) => p.id === projectId)?.data;
  const destination = projects.rows.find((p) => p.id === target)?.data;
  const destinations = projects.rows.filter(
    (p) =>
      p.id !== projectId &&
      source &&
      !isHidden(p.data, revealed) &&
      compatibleMoveProject(source, p.data),
  );
  const activeTopics = Array.isArray(destination?.topics)
    ? destination.topics.filter(
        (p): p is Record<string, unknown> =>
          !!p &&
          typeof p === 'object' &&
          !(p as Record<string, unknown>).archived &&
          !(p as Record<string, unknown>).mergedIntoTopicId,
      )
    : [];
  const clear = () => {
    setPreview(null);
    setAck(false);
    setError('');
    intent.current = null;
  };
  const close = () => {
    if (lock.current) return;
    intent.current = null;
    onClose();
  };
  async function run(execute: boolean) {
    if (
      lock.current ||
      mutationBusy?.current ||
      !target ||
      !reason.trim() ||
      done ||
      getAuth(functions.app).currentUser?.uid !== uid ||
      !source ||
      isHidden(source, revealed) ||
      !destinations.some((p) => p.id === target)
    )
      return;
    lock.current = true;
    if (mutationBusy) mutationBusy.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      const fields = recordId
        ? {
            recordId,
            project_target: target,
            ...(topic ? { subject_target: topic } : {}),
          }
        : {
            project_origin: projectId,
            subject_origin: subjectId,
            project_target: target,
            ...(topic ? { subject_target: topic } : {}),
          };
      const key = JSON.stringify({ ...fields, reason: reason.trim() });
      if (!intent.current || intent.current.key !== key)
        intent.current = {
          key,
          payload: {
            ...fields,
            reason: reason.trim(),
            requestId: crypto.randomUUID(),
          },
        };
      const payload = execute
        ? moveConfirmation(intent.current.payload, preview!, ack)
        : { ...intent.current.payload, confirmed: false };
      const result = await httpsCallable(
        functions,
        recordId ? 'moveRecord' : 'moveSubject',
      )(payload);
      if (execute) {
        const response = result.data as { mode?: string };
        if (response.mode !== 'execution')
          throw Error('Resposta de transferência inválida.');
        ownRecordsRepository.invalidate();
        projectRepository.invalidate();
        setDone(true);
        setPreview(null);
        intent.current = null;
      } else {
        const response = result.data as MovePreview;
        if (
          response.mode !== 'preview' ||
          response.project_origin !== projectId ||
          response.project_target !== target ||
          response.operation !== (recordId ? 'move_record' : 'move_subject') ||
          !response.previewToken ||
          !Array.isArray(response.recordIds) ||
          !Array.isArray(response.warnings)
        )
          throw Error('Prévia inválida.');
        setPreview(response);
        setAck(false);
      }
    } catch (failure) {
      if (
        failure &&
        typeof failure === 'object' &&
        'code' in failure &&
        failure.code === 'functions/failed-precondition'
      ) {
        setPreview(null);
        setAck(false);
      }
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível transferir. Tente novamente com a mesma intenção ou confira nova prévia.',
      );
    } finally {
      lock.current = false;
      if (mutationBusy) mutationBusy.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  if (
    !done &&
    (!source ||
      isHidden(source, revealed) ||
      getAuth(functions.app).currentUser?.uid !== uid ||
      (destination && isHidden(destination, revealed)))
  )
    return (
      <Dialog open onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>Transferência indisponível</DialogTitle>
        <DialogContent>
          <Alert severity="info">
            Contexto de transferência oculto ou indisponível. Revele os dados e
            confira seu acesso para continuar.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button sx={{ minHeight: 44 }} disabled={busy} onClick={close}>
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>
    );
  return (
    <Dialog
      open
      onClose={close}
      fullWidth
      maxWidth="sm"
      aria-labelledby="move-title"
    >
      <DialogTitle id="move-title">
        {recordId ? 'Mover registro' : 'Transferir assunto'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>Origem: {originLabel}</Typography>
          <Alert severity="info">
            Somente seus registros ativos serão movidos entre projetos do mesmo
            escopo. Registros com múltiplos assuntos são bloqueados. Horários,
            textos e autoria serão preservados; não haverá duplicação de horas.
            O assunto de origem permanece para histórico e outras pessoas.
          </Alert>
          {done ? (
            <Alert severity="success">
              Transferência concluída e auditada. Os dados e relatórios serão
              atualizados.
            </Alert>
          ) : (
            <>
              <Stack
                sx={{
                  width: '100%',
                  minWidth: 0,
                  '& .MuiAutocomplete-root': { width: '100%', minWidth: 0 },
                  '& .MuiInputBase-root': { minHeight: 44 },
                }}
              >
                <ProjectSelector
                  label="Projeto de destino"
                  projects={destinations.map((p) => ({
                    id: p.id,
                    label: text(
                      safeProject(p.data, revealed).title,
                      'Projeto reservado',
                    ),
                    searchText: revealed ? text(p.data.title, '') : '',
                  }))}
                  projectId={target}
                  allowAll={false}
                  loading={projects.loading}
                  error={projects.error}
                  disabled={busy}
                  onChange={(id) => {
                    setTarget(id);
                    setTopic('');
                    clear();
                  }}
                />
              </Stack>
              {!projects.loading && !destinations.length && (
                <Alert severity="info">
                  Nenhum outro projeto ativo compatível disponível.
                  Transferências entre Pessoal e Global não são permitidas.
                </Alert>
              )}
              <TextField
                select
                label="Assunto no destino"
                slotProps={{
                  inputLabel: { shrink: true },
                  select: {
                    displayEmpty: true,
                    renderValue: () =>
                      topic
                        ? text(
                            activeTopics.find((t) => String(t.id) === topic)
                              ?.title,
                            'Assunto',
                          )
                        : 'Mesmo nome no destino',
                  },
                }}
                value={topic}
                disabled={busy || !destination}
                onChange={(e) => {
                  setTopic(e.target.value);
                  clear();
                }}
                helperText="A prévia confirma se o mesmo nome será reutilizado ou criado."
              >
                <MenuItem value="">Mesmo nome no destino</MenuItem>
                {activeTopics.map((t) => (
                  <MenuItem key={String(t.id)} value={String(t.id)}>
                    {text(safeProject(t, revealed).title, 'Assunto reservado')}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Motivo da transferência"
                multiline
                minRows={2}
                value={reason}
                disabled={busy}
                onChange={(e) => {
                  setReason(e.target.value);
                  clear();
                }}
              />
              {preview && (
                <>
                  <Typography>
                    Prévia: {preview.recordCount} registro(s) para{' '}
                    {text(
                      safeProject(destination ?? {}, revealed).title,
                      'Projeto reservado',
                    )}{' '}
                    · {preview.resolvedSubject.title} (
                    {preview.resolvedSubject.willCreate
                      ? 'será criado'
                      : 'será reutilizado'}
                    ).
                  </Typography>
                  {preview.warnings.map((warning, index) => (
                    <Alert severity="warning" key={index}>
                      {warning}
                    </Alert>
                  ))}
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={ack}
                        disabled={busy}
                        onChange={(e) => setAck(e.target.checked)}
                      />
                    }
                    label="Conferi origem, destino e impacto. Autorizo esta transferência."
                  />
                </>
              )}
              {error && <Alert severity="error">{error}</Alert>}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions
        disableSpacing
        sx={{
          p: 2,
          gap: 1,
          flexDirection: { xs: 'column', sm: 'row' },
          '& .MuiButton-root': {
            minHeight: 44,
            width: { xs: '100%', sm: 'auto' },
          },
        }}
      >
        <Button disabled={busy} onClick={close}>
          {done ? 'Concluir' : 'Cancelar'}
        </Button>
        {!done &&
          (preview ? (
            <Button
              variant="contained"
              disabled={busy || !ack}
              onClick={() => void run(true)}
            >
              {busy ? 'Transferindo…' : 'Confirmar transferência'}
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={busy || !target || !reason.trim()}
              onClick={() => void run(false)}
            >
              {busy ? 'Consultando…' : 'Conferir prévia'}
            </Button>
          ))}
      </DialogActions>
    </Dialog>
  );
}
