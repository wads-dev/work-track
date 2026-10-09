import { Button } from './components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from './components/ui/tooltip';
import { Alert, AlertDescription } from './components/ui/alert';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Checkbox } from './components/ui/checkbox';
import { projectMutation } from './project-mutation';
import { useRef, useState } from 'react';
import { UiIcon } from './UiIcons';
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
    <div className="my-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={archived ? 'Desarquivar projeto' : 'Arquivar projeto'}
            aria-expanded={expanded}
            aria-controls="project-archive-panel"
            onClick={() => setExpanded((value) => !value)}
            variant="ghost"
            size="icon"
            className="shrink-0"
          >
            <UiIcon kind={'archive'} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {archived ? 'Desarquivar projeto' : 'Arquivar projeto'}
        </TooltipContent>
      </Tooltip>
      <div id="project-archive-panel" hidden={!expanded}>
        <div className="rounded-xl border bg-card p-4 text-card-foreground">
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">
              {archived ? 'Projeto arquivado' : 'Projeto ativo'}
            </h3>
            <Alert className="my-2">
              <AlertDescription>
                Arquivamento oculta o projeto das seleções padrão sem apagar
                registros ou evidências. Tempos continuam participando do
                orçamento global diário.
              </AlertDescription>
            </Alert>
            {merged && (
              <Alert className="my-2">
                <AlertDescription>
                  Origem de mesclagem não pode ser desarquivada genericamente.
                  Histórico permanece disponível.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="my-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert role="status" className="my-2">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
            <div className="min-w-0 space-y-2">
              <Label htmlFor={'ProjectArchive-3226'}>
                {'Motivo do arquivamento/desarquivamento'}
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setConfirmed(false);
                }}
                disabled={busy || merged}
                id={'ProjectArchive-3226'}
                maxLength={1000}
              ></Textarea>
            </div>
            <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
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
            <Button
              disabled={busy || merged || !confirmed || !reason.trim()}
              onClick={() => void save()}
              variant="default"
              className="min-h-11"
            >
              {busy
                ? 'Salvando…'
                : archived
                  ? 'Desarquivar projeto'
                  : 'Arquivar projeto'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
