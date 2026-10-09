import { Button } from './components/ui/button';
import {
  SelectItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from './components/ui/select';
import { Label } from './components/ui/label';
import { Checkbox } from './components/ui/checkbox';
import { Alert, AlertDescription } from './components/ui/alert';
import { Input } from './components/ui/input';
import { useRef, useState } from 'react';
import { MoveDialog } from './MoveDialog';
import { getAuth } from 'firebase/auth';
import { projectMutation } from './project-mutation';
import { httpsCallable, type Functions } from 'firebase/functions';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { date, objects, text } from './data';
import { Link as RouterLink } from 'react-router-dom';
import { topicDetailsPath } from './routes';
import { isHidden, usePrivacy } from './privacy';
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
  const { revealed } = usePrivacy();
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
    text(catalog.find((t) => t.id === id)?.title, 'Tópico');
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
          'Tópicos mesclados. Registros e snapshots preservados. Recarregue o catálogo antes de outra operação.',
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
    <section
      aria-label={'Gerenciar tópicos'}
      className="rounded-xl border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Tópicos do projeto</h3>
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
        <ul className="space-y-2">
          {catalog.map((t, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-2 break-words"
            >
              <div className="min-w-0 flex-1">
                {!isHidden(project, revealed) && text(t.id, '') ? (
                  <RouterLink
                    to={
                      topicDetailsPath(projectId, text(t.id)) +
                      '?returnTo=' +
                      encodeURIComponent(location.pathname + location.search)
                    }
                    className="text-primary underline underline-offset-4"
                  >
                    {text(t.title, 'Tópico')}
                  </RouterLink>
                ) : (
                  'Tópico reservado'
                )}
                {t.mergedIntoTopicId
                  ? ' · alias histórico de ' +
                    label(text(t.mergedIntoTopicId, ''))
                  : t.archived
                    ? ' · arquivado'
                    : ''}
              </div>
              {!t.archived && !t.mergedIntoTopicId && (
                <Button
                  disabled={busy || !!movingTopic}
                  aria-label={'Transferir tópico ' + text(t.title)}
                  onClick={() => setMovingTopic(t)}
                  variant="outline"
                  className="min-h-11"
                >
                  Transferir
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm">
          Mescle tópicos sem reescrever registros ou snapshots. Geral não pode
          ser origem; pode ser destino. Não há desfazer.
        </p>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectTopics-7680'}>{'Tópicos de origem'}</Label>
          <div className="space-y-2 rounded-md border p-3">
            {active
              .filter((t) => t.id !== 'general' && t.id !== target)
              .map((t) => (
                <label key={text(t.id, '')} className="flex items-center gap-2">
                  <Checkbox
                    checked={sources.includes(text(t.id, ''))}
                    disabled={busy || !!message}
                    onCheckedChange={(checked) =>
                      update(
                        'mergeSources',
                        (checked === true
                          ? [...sources, text(t.id, '')]
                          : sources.filter((id) => id !== text(t.id, ''))
                        ).join(','),
                      )
                    }
                  />
                  <span>{text(t.title, 'Tópico')}</span>
                </label>
              ))}
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectTopics-8399'}>{'Tópico de destino'}</Label>
          <Select
            value={target}
            disabled={busy || !!message}
            onValueChange={(value) => update('mergeTarget', value)}
          >
            <SelectTrigger id={'ProjectTopics-8399'}>
              <SelectValue placeholder={'Tópico de destino'} />
            </SelectTrigger>
            <SelectContent>
              {active
                .filter((t) => !sources.includes(text(t.id, '')))
                .map((t, i) => (
                  <SelectItem key={i} value={text(t.id, '')}>
                    {text(t.title, 'Tópico')}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => void run(false)}
          disabled={!valid || busy || !!message}
          variant="outline"
          className="min-h-11"
        >
          Consultar preview
        </Button>
        {currentPreview && (
          <>
            <p className="text-sm leading-relaxed">
              Origens:{' '}
              {currentPreview.sourceTopics
                .map((t) => text(t.title, 'Tópico'))
                .join(', ')}{' '}
              → {text(currentPreview.targetTopic.title, 'Tópico')}
            </p>
            <Alert className="my-2">
              <AlertDescription>
                Registros não varridos no preview. Quantidade impactada
                desconhecida; não significa zero. Originais preservados.
              </AlertDescription>
            </Alert>
            {currentPreview.warnings.map((w, i) => (
              <Alert key={i} className="my-2">
                <AlertDescription>{w}</AlertDescription>
              </Alert>
            ))}
            <div className="min-w-0 space-y-2">
              <Label htmlFor={'ProjectTopics-9816'}>
                {'Motivo da mesclagem'}
              </Label>
              <Input
                required={true}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setConfirmed(false);
                }}
                disabled={busy}
                id={'ProjectTopics-9816'}
              ></Input>
            </div>
            <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
              <Checkbox
                checked={confirmed}
                disabled={busy}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <span>
                {'Confirmo origens, destino e mesclagem sem desfazer'}
              </span>
            </Label>
            <Button
              disabled={busy || !confirmed || !reason.trim()}
              onClick={() => void run(true)}
              variant="default"
              className="min-h-11"
            >
              Executar mesclagem confirmada
            </Button>
          </>
        )}
        {message && (
          <Alert role="status" className="my-2">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="my-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          disabled={busy}
          onClick={() => void loadHistory()}
          variant="ghost"
          className="min-h-11"
        >
          Consultar histórico de mesclagens
        </Button>
        {loaded && (
          <>
            <p className="text-xs text-muted-foreground">
              Paginado por ID, não em ordem cronológica global. Autoria não
              exibida.
            </p>
            {history.length === 0 ? (
              <p className="text-sm leading-relaxed">
                Nenhuma mesclagem nesta consulta.
              </p>
            ) : (
              history.map((item) => (
                <div key={item.id} className="rounded-lg border p-4">
                  <p className="text-sm leading-relaxed">
                    {date(item.recordedAt)}· {item.reason}
                  </p>
                  <p className="text-sm">
                    {item.sourceTopicIds
                      .map((id) =>
                        text(
                          item.before.find((t) => t.id === id)?.title,
                          'Tópico',
                        ),
                      )
                      .join(', ')}{' '}
                    →{' '}
                    {text(
                      item.after.find((t) => t.id === item.targetTopicId)
                        ?.title,
                      'Tópico',
                    )}
                  </p>
                </div>
              ))
            )}
            {cursor && (
              <Button
                disabled={busy}
                onClick={() => void loadHistory(true)}
                variant="ghost"
                className="min-h-11"
              >
                Carregar mais histórico
              </Button>
            )}
          </>
        )}
        {busy && (
          <p role={'status'} className="text-sm leading-relaxed">
            Aguardando operação…
          </p>
        )}
      </div>
    </section>
  );
}
