import {
  DialogTitle,
  DialogFooter,
  Dialog,
  DialogContent,
} from './components/ui/dialog';
import { Alert, AlertDescription } from './components/ui/alert';
import { Button } from './components/ui/button';
import {
  SelectItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from './components/ui/select';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Checkbox } from './components/ui/checkbox';
import { useRef, useState } from 'react';
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
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        >
          <DialogTitle>Transferência indisponível</DialogTitle>
          <div className="space-y-4">
            <Alert className="my-2">
              <AlertDescription>
                Contexto de transferência oculto ou indisponível. Revele os
                dados e confira seu acesso para continuar.
              </AlertDescription>
            </Alert>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        aria-labelledby={'move-title'}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        <DialogTitle id={'move-title'}>
          {recordId ? 'Mover registro' : 'Transferir tópico'}
        </DialogTitle>
        <div className="space-y-4">
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed">Origem: {originLabel}</p>
            <Alert className="my-2">
              <AlertDescription>
                Somente seus registros ativos serão movidos entre projetos do
                mesmo escopo. Registros com múltiplos tópicos são bloqueados.
                Horários, textos e autoria serão preservados; não haverá
                duplicação de horas. O tópico de origem permanece para histórico
                e outras pessoas.
              </AlertDescription>
            </Alert>
            {done ? (
              <Alert role="status" className="my-2">
                <AlertDescription>
                  Transferência concluída e auditada. Os dados e relatórios
                  serão atualizados.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex flex-col gap-4">
                  <ProjectSelector
                    label={'Projeto de destino'}
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
                </div>
                {!projects.loading && !destinations.length && (
                  <Alert className="my-2">
                    <AlertDescription>
                      Nenhum outro projeto ativo compatível disponível.
                      Transferências entre Pessoal e Global não são permitidas.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={'MoveDialog-8616'}>
                    {'Tópico no destino'}
                  </Label>
                  <Select
                    value={topic || '__same_name__'}
                    disabled={busy || !destination}
                    onValueChange={(value) => {
                      setTopic(value === '__same_name__' ? '' : value);
                      clear();
                    }}
                  >
                    <SelectTrigger id={'MoveDialog-8616'}>
                      <SelectValue placeholder="Mesmo nome no destino" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__same_name__">
                        Mesmo nome no destino
                      </SelectItem>
                      {activeTopics.map((t) => (
                        <SelectItem key={String(t.id)} value={String(t.id)}>
                          {text(
                            safeProject(t, revealed).title,
                            'Tópico reservado',
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p
                    id="MoveDialog-8616-help"
                    className="text-xs text-muted-foreground"
                  >
                    {
                      'A prévia confirma se o mesmo nome será reutilizado ou criado.'
                    }
                  </p>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={'MoveDialog-9872'}>
                    {'Motivo da transferência'}
                  </Label>
                  <Textarea
                    value={reason}
                    disabled={busy}
                    onChange={(e) => {
                      setReason(e.target.value);
                      clear();
                    }}
                    id={'MoveDialog-9872'}
                    rows={2}
                  ></Textarea>
                </div>
                {preview && (
                  <>
                    <p className="text-sm leading-relaxed">
                      Prévia: {preview.recordCount}registro(s) para{' '}
                      {text(
                        safeProject(destination ?? {}, revealed).title,
                        'Projeto reservado',
                      )}{' '}
                      · {preview.resolvedSubject.title}(
                      {preview.resolvedSubject.willCreate
                        ? 'será criado'
                        : 'será reutilizado'}
                      ).
                    </p>
                    {preview.warnings.map((warning, index) => (
                      <Alert key={index} className="my-2">
                        <AlertDescription>{warning}</AlertDescription>
                      </Alert>
                    ))}
                    <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                      <Checkbox
                        checked={ack}
                        disabled={busy}
                        onCheckedChange={(checked) => setAck(checked === true)}
                      />
                      <span>
                        {
                          'Conferi origem, destino e impacto. Autorizo esta transferência.'
                        }
                      </span>
                    </Label>
                  </>
                )}
                {error && (
                  <Alert variant="destructive" className="my-2">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </>
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
            {done ? 'Concluir' : 'Cancelar'}
          </Button>
          {!done &&
            (preview ? (
              <Button
                disabled={busy || !ack}
                onClick={() => void run(true)}
                variant="default"
                className="min-h-11"
              >
                {busy ? 'Transferindo…' : 'Confirmar transferência'}
              </Button>
            ) : (
              <Button
                disabled={busy || !target || !reason.trim()}
                onClick={() => void run(false)}
                variant="default"
                className="min-h-11"
              >
                {busy ? 'Consultando…' : 'Conferir prévia'}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
