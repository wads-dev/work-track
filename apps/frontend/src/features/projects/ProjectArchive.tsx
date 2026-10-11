import { Button } from '../../components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '../../components/ui/tooltip';
import { Alert } from '../../components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { projectMutation } from '../../infrastructure/firebase/project-mutation';
import { useRef, useState } from 'react';
import { UiIcon } from '../../shared/ui/UiIcons';
import { type Functions } from 'firebase/functions';
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
  const reason = 'Alteração de arquivamento pela interface web.';
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const intent = useRef<{ key: string; requestId: string } | null>(null);
  const busyRef = useRef(false);
  async function save() {
    if (busyRef.current || merged || project.mergeLock) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (!confirmed || !reason.trim())
        throw new Error('Confirme o arquivamento.');
      const key = JSON.stringify({
        projectId,
        archived: !archived,
        reason: reason.trim(),
      });
      if (intent.current?.key !== key)
        intent.current = { key, requestId: crypto.randomUUID() };
      await projectMutation(
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
      setSuccess(archived ? 'Projeto desarquivado.' : 'Projeto arquivado.');
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Falha ao alterar arquivamento.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={archived ? 'Desarquivar projeto' : 'Arquivar projeto'}
            onClick={() => {
              setExpanded(true);
              setConfirmed(false);
              setError('');
              setSuccess('');
            }}
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            disabled={merged || !!project.mergeLock}
          >
            <UiIcon kind="archive" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {archived ? 'Desarquivar projeto' : 'Arquivar projeto'}
        </TooltipContent>
      </Tooltip>
      <Dialog
        open={expanded}
        onOpenChange={(open) => {
          if (!busy) {
            setExpanded(open);
            if (!open) {
              setConfirmed(false);
              intent.current = null;
            }
          }
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {success
                ? 'Arquivamento atualizado'
                : archived
                  ? 'Desarquivar projeto'
                  : 'Arquivar projeto'}
            </DialogTitle>
            <DialogDescription>
              Arquivar oculta o projeto das seleções padrão sem apagar registros
              ou histórico.
            </DialogDescription>
          </DialogHeader>
          {error && <Alert variant="destructive">{error}</Alert>}
          {success ? (
            <Alert role="status">{success}</Alert>
          ) : (
            <Label className="flex items-start gap-3 leading-relaxed">
              <Checkbox
                checked={confirmed}
                disabled={busy || merged}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <span>
                {archived
                  ? 'Confirmo desarquivar este projeto'
                  : 'Confirmo arquivar este projeto sem apagar seus registros'}
              </span>
            </Label>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setExpanded(false)}
            >
              {success ? 'Fechar' : 'Cancelar'}
            </Button>
            {!success && (
              <Button
                disabled={busy || merged || !confirmed}
                onClick={() => void save()}
              >
                {busy ? 'Salvando…' : archived ? 'Desarquivar' : 'Arquivar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
