import { useEffect, useReducer, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { httpsCallable, type Functions } from 'firebase/functions';
import { createProjectDeletion, downloadProjectJson } from './project-deletion';
import { projectRepository } from './project-repository';
import { ownRecordsRepository } from './own-records-repository';

export function ProjectDeletion({
  functions,
  uid,
  projectId,
  project,
  onDeleted,
}: {
  functions: Functions;
  uid: string;
  projectId: string;
  project: Record<string, unknown>;
  onDeleted: () => void;
}) {
  const [, update] = useReducer((n: number) => n + 1, 0);
  const [expanded, setExpanded] = useState(false);
  const title = typeof project.title === 'string' ? project.title : '';
  const live = useRef(true);
  const [flow] = useState(() =>
    createProjectDeletion({
      projectId,
      title,
      current: () =>
        live.current && getAuth(functions.app).currentUser?.uid === uid,
      exportProject: async () => {
        const result = await httpsCallable<
          { projectId: string },
          { snapshotToken: string; export: unknown }
        >(
          functions,
          'exportProjectForDeletion',
        )({ projectId });
        return {
          snapshotToken: result.data.snapshotToken,
          exportData: result.data.export,
        };
      },
      download: (data) => downloadProjectJson(data, projectId),
      deleteProject: (backup) =>
        httpsCallable(
          functions,
          'deleteProjectPermanently',
        )({
          projectId,
          snapshotToken: backup.snapshotToken,
          confirmed: true,
          downloadAttested: true,
        }),
      requestId: () => crypto.randomUUID(),
      onChange: update,
      onDeleted: () => {
        projectRepository.invalidate();
        ownRecordsRepository.invalidate();
        onDeleted();
      },
    }),
  );
  useEffect(() => {
    live.current = true;
    const stop = onAuthStateChanged(getAuth(functions.app), (user) => {
      if (user?.uid !== uid) {
        live.current = false;
        flow.reset();
        setExpanded(false);
      }
    });
    return () => {
      live.current = false;
      flow.reset();
      stop();
    };
  }, [flow, functions, uid]);
  const state = flow.snapshot();
  return (
    <Paper
      component="section"
      aria-label="Exclusão permanente"
      variant="outlined"
      sx={{ p: 2, mt: 3, borderColor: 'error.main' }}
    >
      <Stack spacing={2}>
        <Typography component="h3" variant="h6" color="error">
          Zona de perigo · exclusão permanente
        </Typography>
        <Typography variant="body2">
          Diferente de arquivar: apagar remove definitivamente o projeto e seus
          dados.
        </Typography>
        {!expanded ? (
          <Button
            color="error"
            onClick={() => {
              flow.reset();
              setExpanded(true);
            }}
          >
            Preparar exclusão permanente
          </Button>
        ) : (
          <>
            <Alert severity="error">
              Esta operação é irreversível. Apaga o projeto, tópicos e registros
              vinculados, inclusive os de outras pessoas em projetos
              corporativos. As horas deixam de participar de relatórios e podem
              alterar o orçamento global diário. O JSON é uma cópia de
              segurança, não uma restauração automática.
            </Alert>
            <Typography variant="body2">
              Primeiro exporte todos os dados e inicie o download do JSON. O
              navegador não consegue verificar se o arquivo foi salvo no disco:
              confira o download e abra o arquivo antes de confirmar. Baixar não
              exclui nada.
            </Typography>
            <Button
              variant="outlined"
              disabled={!!state.busy}
              onClick={() => {
                void flow.download();
              }}
            >
              {state.busy === 'export'
                ? 'Exportando…'
                : state.backup
                  ? 'Exportar e baixar novo JSON'
                  : 'Exportar e baixar JSON completo'}
            </Button>
            {state.error && <Alert severity="error">{state.error}</Alert>}
            {state.backup && (
              <>
                <Alert severity="info">
                  Download iniciado. Confira e salve o JSON. Se os dados mudarem
                  no servidor, será necessário baixar outro backup.
                </Alert>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={state.saved}
                      disabled={!!state.busy}
                      onChange={(_, saved) =>
                        flow.confirm(saved, state.typed, state.reason)
                      }
                    />
                  }
                  label="Confirmei que o JSON completo foi salvo e está acessível"
                />
                <TextField
                  label="Digite o nome exato do projeto ou seu ID"
                  helperText={'Nome: ' + title + ' · ID: ' + projectId}
                  value={state.typed}
                  disabled={!!state.busy}
                  onChange={(event) =>
                    flow.confirm(state.saved, event.target.value, state.reason)
                  }
                />
                <TextField
                  label="Motivo da exclusão"
                  value={state.reason}
                  disabled={!!state.busy}
                  onChange={(event) =>
                    flow.confirm(state.saved, state.typed, event.target.value)
                  }
                />
                <Button
                  variant="contained"
                  color="error"
                  disabled={!flow.canDelete()}
                  onClick={() => {
                    void flow.delete();
                  }}
                >
                  {state.busy === 'delete'
                    ? 'Excluindo…'
                    : 'Excluir projeto permanentemente'}
                </Button>
              </>
            )}
            <Button
              disabled={state.busy === 'delete'}
              onClick={() => {
                flow.reset();
                setExpanded(false);
              }}
            >
              Cancelar e descartar confirmações
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
