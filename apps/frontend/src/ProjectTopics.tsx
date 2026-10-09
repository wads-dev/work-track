import { useRef, useState } from 'react';
import { MoveDialog } from './MoveDialog';
import { getAuth } from 'firebase/auth';
import { projectMutation } from './project-mutation';
import { httpsCallable, type Functions } from 'firebase/functions';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { date, objects, text } from './data';
type Preview = {
  sourceTopics: Record<string, unknown>[];
  targetTopic: Record<string, unknown>;
  warnings: string[];
};
type Audit = {
  id: string;
  reason: string;
  recordedAt: string;
  before: Record<string, unknown>[];
  after: Record<string, unknown>[];
  sourceTopicIds: string[];
  targetTopicId: string;
};
export function ProjectTopics({
  functions,
  projectId,
  project,
}: {
  functions: Functions;
  projectId: string;
  project: Record<string, unknown>;
}) {
  const [movingTopic, setMovingTopic] = useState<Record<
    string,
    unknown
  > | null>(null);
  const catalog = objects(project.topics);
  const active = catalog.filter((t) => !t.archived && !t.mergedIntoTopicId);
  const [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate();
  const sources = (params.get('mergeSources') ?? '').split(',').filter(Boolean),
    target = params.get('mergeTarget') ?? '';
  const [preview, setPreview] = useState<Preview | null>(null),
    [reason, setReason] = useState(''),
    [confirmationKey, setConfirmationKey] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [history, setHistory] = useState<Audit[]>([]),
    [cursor, setCursor] = useState<string | undefined>(),
    [loaded, setLoaded] = useState(false);
  const intent = useRef<{ key: string; id: string } | null>(null);
  const previewKey = useRef('');
  const selection = JSON.stringify([projectId, sources, target]);
  const currentPreview = previewKey.current === selection ? preview : null;
  const confirmKey = JSON.stringify([selection, reason]);
  const confirmed = confirmationKey === confirmKey;
  const setConfirmed = (value: boolean) =>
    setConfirmationKey(value ? confirmKey : '');
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setConfirmed(false);
    navigate({
      pathname: location.pathname,
      search: '?' + next.toString(),
      hash: location.hash,
    });
  };
  const label = (id: string) =>
    text(catalog.find((t) => t.id === id)?.title, 'Assunto');
  const valid =
    sources.length > 0 &&
    sources.length <= 30 &&
    !sources.includes('general') &&
    !sources.includes(target) &&
    active.some((t) => t.id === target) &&
    sources.every((id) => active.some((t) => t.id === id));
  const run = async (execute: boolean) => {
    if (
      !valid ||
      (execute && (!currentPreview || !confirmed || !reason.trim()))
    )
      return;
    setBusy(true);
    setError('');
    const key = JSON.stringify([projectId, sources, target, reason]);
    if (execute && intent.current?.key !== key)
      intent.current = { key, id: crypto.randomUUID() };
    try {
      const result = await projectMutation(
        functions,
        'mergeTopics',
      )({
        projectId,
        sourceTopicIds: sources,
        targetTopicId: target,
        ...(execute
          ? { confirmed: true, reason, requestId: intent.current?.id }
          : { confirmed: false }),
      });
      if (execute) {
        setMessage(
          'Assuntos mesclados. Registros e snapshots preservados. Recarregue o catálogo antes de outra operação.',
        );
        setPreview(null);
        setConfirmed(false);
        intent.current = null;
      } else {
        previewKey.current = selection;
        setPreview(result.data as Preview);
        setConfirmed(false);
      }
    } catch {
      setError(
        'Operação não concluída. Nenhum sucesso presumido; a mesma intenção mantém seu requestId ao tentar novamente.',
      );
    } finally {
      setBusy(false);
    }
  };
  const loadHistory = async (more = false) => {
    setBusy(true);
    setError('');
    try {
      const r = await httpsCallable<
        { projectId: string; limit: number; cursor?: string },
        { items: Audit[]; nextCursor?: string }
      >(
        functions,
        'listTopicMerges',
      )({ projectId, limit: 20, ...(more && cursor ? { cursor } : {}) });
      setHistory((old) => (more ? [...old, ...r.data.items] : r.data.items));
      setCursor(r.data.nextCursor);
      setLoaded(true);
    } catch {
      setError('Histórico autorizado indisponível.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper
      component="section"
      sx={{ p: 2, mt: 2 }}
      aria-label="Gerenciar assuntos"
    >
      <Stack spacing={2}>
        <Typography component="h3" variant="h6">
          Assuntos do projeto
        </Typography>
        {movingTopic && (
          <MoveDialog
            functions={functions}
            uid={getAuth(functions.app).currentUser?.uid ?? ''}
            projectId={projectId}
            subjectId={String(movingTopic.id)}
            originLabel={text(project.title) + ' · ' + text(movingTopic.title)}
            onClose={() => setMovingTopic(null)}
          />
        )}
        <Box component="ul" sx={{ pl: 0, listStyle: 'none' }}>
          {catalog.map((t, i) => (
            <Box
              component="li"
              key={i}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
                mb: 1,
                overflowWrap: 'anywhere',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {text(t.title, 'Assunto')}
                {t.mergedIntoTopicId
                  ? ' · alias histórico de ' +
                    label(text(t.mergedIntoTopicId, ''))
                  : t.archived
                    ? ' · arquivado'
                    : ''}
              </Box>
              {!t.archived && !t.mergedIntoTopicId && (
                <Button
                  variant="outlined"
                  disabled={busy || !!movingTopic}
                  sx={{ minHeight: 44, flexShrink: 0 }}
                  aria-label={'Transferir assunto ' + text(t.title)}
                  onClick={() => setMovingTopic(t)}
                >
                  Transferir
                </Button>
              )}
            </Box>
          ))}
        </Box>
        <Typography variant="body2">
          Mescle assuntos sem reescrever registros ou snapshots. Geral não pode
          ser origem; pode ser destino. Não há desfazer.
        </Typography>
        <TextField
          select
          label="Assuntos de origem"
          value={sources}
          slotProps={{ select: { multiple: true } }}
          onChange={(e) =>
            update(
              'mergeSources',
              typeof e.target.value === 'string'
                ? e.target.value
                : (e.target.value as string[]).join(','),
            )
          }
          disabled={busy || !!message}
        >
          {active
            .filter((t) => t.id !== 'general' && t.id !== target)
            .map((t, i) => (
              <MenuItem key={i} value={text(t.id, '')}>
                {text(t.title, 'Assunto')}
              </MenuItem>
            ))}
        </TextField>
        <TextField
          select
          label="Assunto de destino"
          value={target}
          onChange={(e) => update('mergeTarget', e.target.value)}
          disabled={busy || !!message}
        >
          <MenuItem value="">Escolha o destino</MenuItem>
          {active
            .filter((t) => !sources.includes(text(t.id, '')))
            .map((t, i) => (
              <MenuItem key={i} value={text(t.id, '')}>
                {text(t.title, 'Assunto')}
              </MenuItem>
            ))}
        </TextField>
        <Button
          onClick={() => void run(false)}
          disabled={!valid || busy || !!message}
          variant="outlined"
        >
          Consultar preview
        </Button>
        {currentPreview && (
          <>
            <Typography>
              Origens:{' '}
              {currentPreview.sourceTopics
                .map((t) => text(t.title, 'Assunto'))
                .join(', ')}{' '}
              → {text(currentPreview.targetTopic.title, 'Assunto')}
            </Typography>
            <Alert severity="info">
              Registros não varridos no preview. Quantidade impactada
              desconhecida; não significa zero. Originais preservados.
            </Alert>
            {currentPreview.warnings.map((w, i) => (
              <Alert severity="warning" key={i}>
                {w}
              </Alert>
            ))}
            <TextField
              required
              label="Motivo da mesclagem"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setConfirmed(false);
              }}
              disabled={busy}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={busy}
                />
              }
              label="Confirmo origens, destino e mesclagem sem desfazer"
            />
            <Button
              color="warning"
              variant="contained"
              disabled={busy || !confirmed || !reason.trim()}
              onClick={() => void run(true)}
            >
              Executar mesclagem confirmada
            </Button>
          </>
        )}
        {message && <Alert severity="success">{message}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        <Button disabled={busy} onClick={() => void loadHistory()}>
          Consultar histórico de mesclagens
        </Button>
        {loaded && (
          <>
            <Typography variant="caption">
              Paginado por ID, não em ordem cronológica global. Autoria não
              exibida.
            </Typography>
            {history.length === 0 ? (
              <Typography>Nenhuma mesclagem nesta consulta.</Typography>
            ) : (
              history.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    p: 2,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: '8px',
                  }}
                >
                  <Typography>
                    {date(item.recordedAt)} · {item.reason}
                  </Typography>
                  <Typography variant="body2">
                    {item.sourceTopicIds
                      .map((id) =>
                        text(
                          item.before.find((t) => t.id === id)?.title,
                          'Assunto',
                        ),
                      )
                      .join(', ')}{' '}
                    →{' '}
                    {text(
                      item.after.find((t) => t.id === item.targetTopicId)
                        ?.title,
                      'Assunto',
                    )}
                  </Typography>
                </Box>
              ))
            )}
            {cursor && (
              <Button disabled={busy} onClick={() => void loadHistory(true)}>
                Carregar mais histórico
              </Button>
            )}
          </>
        )}
        {busy && <Typography role="status">Aguardando operação…</Typography>}
      </Stack>
    </Paper>
  );
}
