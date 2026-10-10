import { createCallable } from '../../infrastructure/firebase/callable-command-gateway';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { useEffect, useReducer, useRef, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import { createProjectDeletion, downloadProjectJson } from './project-deletion';
import { projectRepository } from '../../data/cache/project-repository';
import { ownRecordsRepository } from '../../data/cache/own-records-repository';

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
        const result = await createCallable<
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
        createCallable(
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
    <section
      aria-label={'Exclusão permanente'}
      className="mt-6 rounded-xl border border-destructive bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-destructive">
          Zona de perigo · exclusão permanente
        </h3>
        <p className="text-sm">
          Diferente de arquivar: apagar remove definitivamente o projeto e seus
          dados.
        </p>
        {!expanded ? (
          <Button
            onClick={() => {
              flow.reset();
              setExpanded(true);
            }}
            variant="destructive"
            className="min-h-11"
          >
            Preparar exclusão permanente
          </Button>
        ) : (
          <>
            <Alert variant="destructive" className="my-2">
              <AlertDescription>
                Esta operação é irreversível. Apaga o projeto, tópicos e
                registros vinculados, inclusive os de outras pessoas em projetos
                corporativos. As horas deixam de participar de relatórios e
                podem alterar o orçamento global diário. O JSON é uma cópia de
                segurança, não uma restauração automática.
              </AlertDescription>
            </Alert>
            <p className="text-sm">
              Primeiro exporte todos os dados e inicie o download do JSON. O
              navegador não consegue verificar se o arquivo foi salvo no disco:
              confira o download e abra o arquivo antes de confirmar. Baixar não
              exclui nada.
            </p>
            <Button
              disabled={!!state.busy}
              onClick={() => {
                void flow.download();
              }}
              variant="outline"
              className="min-h-11"
            >
              {state.busy === 'export'
                ? 'Exportando…'
                : state.backup
                  ? 'Exportar e baixar novo JSON'
                  : 'Exportar e baixar JSON completo'}
            </Button>
            {state.error && (
              <Alert variant="destructive" className="my-2">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            {state.backup && (
              <>
                <Alert className="my-2">
                  <AlertDescription>
                    Download iniciado. Confira e salve o JSON. Se os dados
                    mudarem no servidor, será necessário baixar outro backup.
                  </AlertDescription>
                </Alert>
                <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                  <Checkbox
                    checked={state.saved}
                    disabled={!!state.busy}
                    onCheckedChange={(checked) =>
                      flow.confirm(checked === true, state.typed, state.reason)
                    }
                  />
                  <span>
                    {'Confirmei que o JSON completo foi salvo e está acessível'}
                  </span>
                </Label>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={'ProjectDeletion-5229'}>
                    {'Digite o nome exato do projeto ou seu ID'}
                  </Label>
                  <Input
                    value={state.typed}
                    disabled={!!state.busy}
                    onChange={(event) =>
                      flow.confirm(
                        state.saved,
                        event.target.value,
                        state.reason,
                      )
                    }
                    id={'ProjectDeletion-5229'}
                    aria-describedby={'ProjectDeletion-5229-help'}
                  ></Input>
                  <p
                    id="ProjectDeletion-5229-help"
                    className="text-xs text-muted-foreground"
                  >
                    {'Nome: ' + title + ' · ID: ' + projectId}
                  </p>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={'ProjectDeletion-5633'}>
                    {'Motivo da exclusão'}
                  </Label>
                  <Input
                    value={state.reason}
                    disabled={!!state.busy}
                    onChange={(event) =>
                      flow.confirm(state.saved, state.typed, event.target.value)
                    }
                    id={'ProjectDeletion-5633'}
                  ></Input>
                </div>
                <Button
                  disabled={!flow.canDelete()}
                  onClick={() => {
                    void flow.delete();
                  }}
                  variant="destructive"
                  className="min-h-11"
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
              variant="ghost"
              className="min-h-11"
            >
              Cancelar e descartar confirmações
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
