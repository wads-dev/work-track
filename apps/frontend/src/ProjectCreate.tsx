import { projectMutation } from './project-mutation';
import { useState } from 'react';
import { type Functions } from 'firebase/functions';
import {
  Alert,
  Box,
  Button,
  Collapse,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
export function ProjectCreate({
  functions,
  onCreated,
}: {
  functions: Functions;
  onCreated: (id: string, type: 'personal' | 'work') => void;
}) {
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [type, setType] = useState<'' | 'personal' | 'work'>(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!type) return;
    setBusy(true);
    setError('');
    try {
      const result = await projectMutation<
        { title: string; description: string; type: 'personal' | 'work' },
        { id: string }
      >(
        functions,
        'createProject',
      )({ title, description, type });
      onCreated(result.data.id, type);
      setOpen(false);
      setTitle('');
      setDescription('');
      setType('');
    } catch {
      setError(
        'Não foi possível criar o projeto. Revise os dados ou tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box
      sx={{
        minWidth: 0,
        width: { xs: '100%', sm: open ? 'auto' : 'fit-content' },
        justifySelf: { xs: 'stretch', sm: 'end' },
        textAlign: { sm: 'right' },
      }}
    >
      <Button
        variant="contained"
        sx={{
          width: { xs: '100%', sm: 'auto' },
          minHeight: 44,
          whiteSpace: 'nowrap',
        }}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="create-project-panel"
      >
        Novo projeto
      </Button>
      <Collapse in={open} unmountOnExit sx={{ textAlign: 'left' }}>
        <Box
          component="form"
          id="create-project-panel"
          onSubmit={submit}
          sx={{
            mt: 2,
            p: 2,
            border: 1,
            borderColor: 'divider',
            borderRadius: '12px',
            bgcolor: 'background.paper',
          }}
        >
          <Stack spacing={2}>
            <Typography component="h2" variant="h6">
              Criar projeto
            </Typography>
            <TextField
              required
              label="Tipo de acesso"
              select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              disabled={busy}
              helperText="Escolha explicitamente. O tipo não poderá ser convertido na edição comum."
            >
              <MenuItem value="" disabled>
                Escolha o tipo de acesso
              </MenuItem>
              <MenuItem value="personal">Pessoal · somente o dono</MenuItem>
              <MenuItem value="work">
                Corporativo · compartilhado com a empresa
              </MenuItem>
            </TextField>
            <TextField
              required
              label="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              slotProps={{ htmlInput: { minLength: 2, maxLength: 160 } }}
            />
            <TextField
              required
              label="Descrição do escopo"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={3}
              disabled={busy}
              slotProps={{ htmlInput: { minLength: 20, maxLength: 6000 } }}
              helperText="Descreva o escopo com pelo menos 20 caracteres."
            />
            <Typography variant="body2" color="text.secondary">
              Confidencialidade visual pode ser configurada nos detalhes; ela
              não substitui o acesso pessoal somente ao dono.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              type="submit"
              variant="contained"
              disabled={
                busy ||
                !type ||
                title.trim().length < 2 ||
                description.trim().length < 20
              }
            >
              {busy ? 'Criando…' : 'Criar projeto'}
            </Button>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}
