import { useRef, useState } from 'react';
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
import { httpsCallable, type Functions } from 'firebase/functions';
import { text } from './data';
export function ProjectEditor({
  functions,
  projectId,
  project,
  hidden,
}: {
  functions: Functions;
  projectId: string;
  project?: Record<string, unknown>;
  hidden: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (hidden)
    return (
      <Alert severity="info" sx={{ my: 2 }}>
        Metadados e gerenciamento ocultos no modo live. O alias exibido é
        neutro; esta ofuscação visual não altera acesso.
      </Alert>
    );
  if (!project)
    return (
      <Alert severity="info">
        Metadados não disponíveis nesta lista limitada. Não é possível editar
        sem conferir o projeto.
      </Alert>
    );
  return (
    <Box sx={{ my: 3 }}>
      <Button onClick={() => setEditing((value) => !value)}>
        {editing ? 'Fechar gerenciamento' : 'Gerenciar projeto'}
      </Button>
      {editing && (
        <ProjectForm
          key={projectId}
          functions={functions}
          projectId={projectId}
          project={project}
        />
      )}
    </Box>
  );
}
function ProjectForm({
  functions,
  projectId,
  project,
}: {
  functions: Functions;
  projectId: string;
  project: Record<string, unknown>;
}) {
  const [title, setTitle] = useState(text(project.title, ''));
  const [description, setDescription] = useState(text(project.description, ''));
  const [type, setType] = useState(text(project.type, ''));
  const [githubUrl, setGithubUrl] = useState(text(project.githubUrl, ''));
  const [confidential, setConfidential] = useState(
    project.confidential === true,
  );
  const [alias, setAlias] = useState(
    text(project.publicAlias, 'Projeto reservado'),
  );
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState('');
  const [preview, setPreview] = useState<{
    count: number;
    topicMapping: { sourceTopicId: string; targetTopicId: string }[];
    warnings: string[];
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [job, setJob] = useState<{
    jobId: string;
    status: string;
    migratedCount: number;
    hasMore: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mergeId, setMergeId] = useState<string>(() => crypto.randomUUID());
  const [recover, setRecover] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const saveIntent = useRef<{ key: string; requestId: string } | null>(null);
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!reason.trim()) throw new Error('Informe o motivo.');
      if (!/^Projeto reservado(?: [0-9]{1,4})?$/.test(alias))
        throw new Error(
          'Alias deve ser Projeto reservado, opcionalmente seguido de número de até 4 dígitos.',
        );
      if (
        githubUrl &&
        !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
          githubUrl,
        )
      )
        throw new Error(
          'GitHub deve ser HTTPS github.com/owner/repo, sem query ou fragmento.',
        );
      const key = JSON.stringify({
        projectId,
        title,
        description,
        type,
        githubUrl,
        confidential,
        alias,
        reason,
      });
      if (saveIntent.current?.key !== key)
        saveIntent.current = { key, requestId: crypto.randomUUID() };
      await httpsCallable(
        functions,
        'updateProject',
      )({
        projectId,
        title,
        description,
        ...(type ? { type } : {}),
        githubUrl: githubUrl || null,
        confidential,
        publicAlias: alias,
        reason,
        requestId: saveIntent.current.requestId,
      });
      setMessage('Projeto atualizado com auditoria.');
      saveIntent.current = null;
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Falha ao atualizar.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function merge(execute: boolean, cancel = false) {
    setBusy(true);
    setError('');
    try {
      if (!target || target === projectId)
        throw new Error('Informe ID destino diferente da origem.');
      if (
        execute &&
        (!confirmed || (!preview && !recover && !cancel) || !reason.trim())
      )
        throw new Error('Confira preview, motivo e confirmação explícita.');
      if (cancel && !cancelConfirmed)
        throw new Error('Confirme cancelamento sem rollback.');
      const result = await httpsCallable(
        functions,
        'mergeProjects',
      )({
        sourceProjectId: projectId,
        targetProjectId: target,
        confirmed: execute,
        ...(cancel ? { cancel: true } : {}),
        ...(execute ? { requestId: mergeId, reason } : {}),
      });
      if (execute) setJob(result.data as typeof job);
      else setPreview(result.data as typeof preview);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Falha na operação.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper sx={{ p: 3, mt: 2 }}>
      <Stack spacing={2}>
        <Typography component="h3" variant="h6">
          Editar metadados
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        <TextField
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
        <TextField
          label="Descrição"
          value={description}
          multiline
          minRows={3}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
        />
        <TextField
          select
          label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={busy}
        >
          <MenuItem value="">Não especificado</MenuItem>
          <MenuItem value="personal">Pessoal</MenuItem>
          <MenuItem value="work">Trabalho</MenuItem>
        </TextField>
        <TextField
          label="GitHub HTTPS"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          disabled={busy}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={confidential}
              onChange={(e) => setConfidential(e.target.checked)}
              disabled={busy}
            />
          }
          label="Projeto confidencial"
        />
        <TextField
          label="Alias público neutro"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          helperText="Não use nome de cliente, sigla ou termos que revelem o projeto. Modo live usa rótulo genérico seguro."
          disabled={busy}
        />
        <TextField
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy || !!job}
        />
        <Button variant="contained" onClick={() => void save()} disabled={busy}>
          Salvar metadados
        </Button>
        <Typography component="h3" variant="h6">
          Mesclar projeto — operação explícita
        </Typography>
        <Alert severity="warning">
          Se origem ou destino for confidencial, destino ficará confidencial.
          Origem: este projeto. Destino deve ser informado por ID. Preview não
          altera dados. Execução migra um lote por clique, preserva originais e
          arquiva origem ao concluir; não há execução automática.
        </Alert>
        <TextField
          label="ID do projeto destino"
          value={target}
          disabled={busy || !!job}
          onChange={(e) => {
            setTarget(e.target.value);
            setPreview(null);
            setConfirmed(false);
          }}
        />
        <Button onClick={() => void merge(false)} disabled={busy || !!job}>
          Consultar preview sem alteração
        </Button>
        <TextField
          label="requestId de recuperação (copie antes de executar)"
          value={mergeId}
          disabled={busy || !!job}
          onChange={(e) => setMergeId(e.target.value)}
          helperText="Guarde este ID, IDs origem/destino e motivo original fora da tela. Após reload, informe os mesmos valores para retomar ou cancelar. Nenhum motivo é salvo no navegador."
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={recover}
              onChange={(e) => setRecover(e.target.checked)}
              disabled={busy || !!job}
            />
          }
          label="Recuperar intenção anterior usando o mesmo requestId, destino e motivo"
        />
        {(preview || recover) && (
          <>
            <Typography>
              Registros previstos: {preview?.count ?? 'Consultar preview'}.
              Mapeamentos de tópicos:{' '}
              {preview?.topicMapping.length ?? 'não consultado'}.
            </Typography>
            {preview?.topicMapping.map((map, index) => (
              <Typography key={index} variant="body2">
                {map.sourceTopicId} → {map.targetTopicId}
              </Typography>
            ))}
            {preview?.warnings.map((warning, index) => (
              <Alert key={index} severity="warning">
                {warning}
              </Alert>
            ))}
            <FormControlLabel
              control={
                <Checkbox
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={busy}
                />
              }
              label="Confirmo origem, destino e migração explícita após conferir preview"
            />
            <Button
              color="warning"
              variant="contained"
              disabled={
                busy ||
                !confirmed ||
                job?.status === 'completed' ||
                job?.status === 'cancelled'
              }
              onClick={() => void merge(true)}
            >
              {job?.hasMore
                ? 'Retomar próximo lote'
                : 'Executar lote confirmado'}
            </Button>
          </>
        )}
        {(job?.status === 'running' || recover) && (
          <>
            <Alert severity="warning">
              Cancelar libera os locks, mas NÃO desfaz lotes já migrados. A
              migração parcial permanecerá. Job cancelado não pode ser retomado.
            </Alert>
            <FormControlLabel
              control={
                <Checkbox
                  checked={cancelConfirmed}
                  onChange={(e) => setCancelConfirmed(e.target.checked)}
                  disabled={busy}
                />
              }
              label="Confirmo cancelar sem rollback dos lotes já migrados"
            />
            <Button
              color="error"
              disabled={
                busy ||
                !cancelConfirmed ||
                !confirmed ||
                job?.status === 'completed' ||
                job?.status === 'cancelled'
              }
              onClick={() => void merge(true, true)}
            >
              Cancelar job sem rollback
            </Button>
          </>
        )}
        {job && (
          <Alert severity={job.status === 'completed' ? 'success' : 'warning'}>
            Job {job.jobId}: {job.status}; {job.migratedCount} registros
            migrados.{' '}
            {job.hasMore
              ? 'Há mais lotes; retome explicitamente.'
              : 'Sem lotes restantes informados.'}
          </Alert>
        )}
        {busy && <Typography role="status">Aguardando operação…</Typography>}
      </Stack>
    </Paper>
  );
}
