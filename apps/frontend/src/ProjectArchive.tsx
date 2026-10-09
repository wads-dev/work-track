import { useRef, useState } from 'react';
import { UiIcon } from './UiIcons';
import {
  Alert,
  Box,
  IconButton,
  Tooltip,
  Collapse,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { httpsCallable, type Functions } from 'firebase/functions';
import { archivedProject } from './project-archive';
export function ProjectArchive({
  functions,
  projectId,
  project,
}: {
  functions: Functions;
  projectId: string;
  project: Record<string, unknown>;
}) {
  const archived = archivedProject(project);
  const merged = typeof project.mergedInto === 'string';
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const intent = useRef<{ key: string; requestId: string } | null>(null);
  async function save() {
    setBusy(true);
    setError('');
    try {
      if (!confirmed || !reason.trim())
        throw new Error('Informe motivo e confirme explicitamente.');
      const key = JSON.stringify({
        projectId,
        archived: !archived,
        reason: reason.trim(),
      });
      if (intent.current?.key !== key)
        intent.current = { key, requestId: crypto.randomUUID() };
      await httpsCallable(
        functions,
        'archiveProject',
      )({
        projectId,
        archived: !archived,
        reason: reason.trim(),
        requestId: intent.current.requestId,
      });
      intent.current = null;
      setConfirmed(false);
      setReason('');
      setSuccess(archived ? 'Projeto desarquivado.' : 'Projeto arquivado.');
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Falha ao alterar arquivamento.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box sx={{ my: 1 }}>
      <Tooltip title={archived ? 'Desarquivar projeto' : 'Arquivar projeto'}>
        <IconButton
          aria-label={archived ? 'Desarquivar projeto' : 'Arquivar projeto'}
          onClick={() => setExpanded((value) => !value)}
        >
          <UiIcon kind="archive" />
        </IconButton>
      </Tooltip>
      <Collapse in={expanded}>
        <Paper sx={{ p: 2, mt: 1 }}>
          <Stack spacing={2}>
            <Typography component="h3" variant="h6">
              {archived ? 'Projeto arquivado' : 'Projeto ativo'}
            </Typography>
            <Alert severity="info">
              Arquivamento oculta o projeto das seleções padrão sem apagar
              registros ou evidências. Tempos continuam participando do
              orçamento global diário.
            </Alert>
            {merged && (
              <Alert severity="warning">
                Origem de mesclagem não pode ser desarquivada genericamente.
                Histórico permanece disponível.
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}
            <TextField
              label="Motivo do arquivamento/desarquivamento"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setConfirmed(false);
              }}
              disabled={busy || merged}
              multiline
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={confirmed}
                  disabled={busy || merged}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
              }
              label={
                archived
                  ? 'Confirmo desarquivar este projeto'
                  : 'Confirmo arquivar este projeto sem apagar seus registros'
              }
            />
            <Button
              variant="contained"
              disabled={busy || merged || !confirmed || !reason.trim()}
              onClick={() => void save()}
            >
              {busy
                ? 'Salvando…'
                : archived
                  ? 'Desarquivar projeto'
                  : 'Arquivar projeto'}
            </Button>
          </Stack>
        </Paper>
      </Collapse>
    </Box>
  );
}
