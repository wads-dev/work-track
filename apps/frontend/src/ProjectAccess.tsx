import { Alert, AlertDescription } from './components/ui/alert';
import {
  SelectItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from './components/ui/select';
import { Label } from './components/ui/label';
import {
  DialogTitle,
  DialogFooter,
  Dialog,
  DialogContent,
} from './components/ui/dialog';
import { Textarea } from './components/ui/textarea';
import { Checkbox } from './components/ui/checkbox';
import { Button } from './components/ui/button';
import { useRef, useState } from 'react';
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
      <Alert className="my-2">
        <AlertDescription>
          Acesso e apresentação ocultos. Revele os dados no topo para gerenciar
          este projeto. Confidencialidade não restringe acesso.
        </AlertDescription>
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
    <section
      aria-label={'Acesso e apresentação'}
      className="rounded-xl border bg-card p-4 text-card-foreground"
    >
      <h3 className="text-lg font-semibold">Acesso e apresentação</h3>
      {message && (
        <Alert role="status" className="my-2">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {error && !target && confidentialTarget === null && (
        <Alert variant="destructive" className="my-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectAccess-6251'}>{'Escopo'}</Label>
          <Select
            value={scope}
            disabled={busy || !!disabledReason}
            onValueChange={(value) => {
              setTarget(value as ProjectScope);
              setReason('');
              setPreview(null);
              setAck(false);
              setError('');
              scopeIntent.current = null;
            }}
          >
            <SelectTrigger id={'ProjectAccess-6251'}>
              <SelectValue placeholder={'Escopo'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={'personal'}>Pessoal</SelectItem>
              <SelectItem value={'work'}>
                {project.type === undefined
                  ? 'Global · organização (legado)'
                  : 'Global · organização'}
              </SelectItem>
            </SelectContent>
          </Select>
          <p
            id="ProjectAccess-6251-help"
            className="text-xs text-muted-foreground"
          >
            {disabledReason ||
              (scope === 'personal'
                ? 'Somente você'
                : 'Pessoas autorizadas da organização; não é público na internet.')}
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectAccess-7272'}>{'Apresentação'}</Label>
          <Select
            value={String(confidential)}
            disabled={busy}
            onValueChange={(value) => {
              setConfidentialTarget(value === 'true');
              setError('');
              confidentialIntent.current = null;
            }}
          >
            <SelectTrigger id={'ProjectAccess-7272'}>
              <SelectValue placeholder={'Apresentação'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={'true'}>Confidencial</SelectItem>
              <SelectItem value={'false'}>Não confidencial</SelectItem>
            </SelectContent>
          </Select>
          <p
            id="ProjectAccess-7272-help"
            className="text-xs text-muted-foreground"
          >
            {'Oculta dados na apresentação; não restringe acesso.'}
          </p>
        </div>
      </div>
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          aria-labelledby={'scope-dialog-title'}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        >
          <DialogTitle id={'scope-dialog-title'}>
            Alterar escopo do projeto
          </DialogTitle>
          <div className="space-y-4">
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed">
                {String(project.title ?? 'Projeto')}·{' '}
                {scope === 'personal' ? 'Pessoal' : 'Global'}→{' '}
                {target === 'personal' ? 'Pessoal' : 'Global · organização'}
              </p>
              <Alert className="my-2">
                <AlertDescription>
                  {target === 'work'
                    ? 'Global compartilha o projeto, tópicos, textos dos registros e histórico de auditoria com pessoas autorizadas da organização. Não é público na internet. Confidencialidade não impede esse acesso.'
                    : 'Pessoal limita o acesso ao criador. A operação será bloqueada se houver registros de outras pessoas, inclusive históricos removidos.'}
                </AlertDescription>
              </Alert>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={'ProjectAccess-8976'}>
                  {'Motivo da alteração'}
                </Label>
                <Textarea
                  value={reason}
                  disabled={busy || !!preview}
                  onChange={(e) => setReason(e.target.value)}
                  id={'ProjectAccess-8976'}
                  rows={2}
                ></Textarea>
              </div>
              {preview && (
                <>
                  <p className="text-sm leading-relaxed">
                    Prévia: {preview.recordCount}registros associados. Nenhum
                    horário, texto ou autoria será reescrito.
                  </p>
                  {preview.warnings.map((warning, index) => (
                    <Alert key={index} className="my-2">
                      <AlertDescription>{warning}</AlertDescription>
                    </Alert>
                  ))}
                  {preview.requiresSharingAcknowledgement && (
                    <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                      <Checkbox
                        checked={ack}
                        disabled={busy}
                        onCheckedChange={(checked) => setAck(checked === true)}
                      />
                      <span>
                        {
                          'Entendo e autorizo compartilhar todos esses dados com a organização.'
                        }
                      </span>
                    </Label>
                  )}
                </>
              )}
              {error && (
                <Alert variant="destructive" className="my-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              disabled={busy}
              onClick={close}
              variant="ghost"
              className="min-h-11"
            >
              Cancelar
            </Button>
            {preview ? (
              <Button
                disabled={
                  busy || (preview.requiresSharingAcknowledgement && !ack)
                }
                onClick={() => void changeScope(true)}
                variant="default"
                className="min-h-11"
              >
                {busy
                  ? 'Atualizando…'
                  : target === 'work'
                    ? 'Confirmar mudança para Global'
                    : 'Confirmar mudança para Pessoal'}
              </Button>
            ) : (
              <Button
                disabled={busy || !reason.trim()}
                onClick={() => void changeScope(false)}
                variant="default"
                className="min-h-11"
              >
                {busy ? 'Consultando…' : 'Conferir prévia'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confidentialTarget !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          aria-labelledby={'confidential-dialog-title'}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        >
          <DialogTitle id={'confidential-dialog-title'}>
            {confidentialTarget
              ? 'Marcar como confidencial?'
              : 'Remover confidencialidade?'}
          </DialogTitle>
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">
              Esta opção oculta dados na apresentação e não altera quem tem
              acesso ao projeto. A mudança será auditada com motivo automático.
            </p>
            {error && (
              <Alert variant="destructive" className="my-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              disabled={busy}
              onClick={close}
              variant="ghost"
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={() => void changeConfidential()}
              variant="default"
              className="min-h-11"
            >
              {busy ? 'Atualizando…' : 'Confirmar apresentação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
