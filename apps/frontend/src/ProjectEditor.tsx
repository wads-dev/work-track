import { Alert, AlertDescription } from './components/ui/alert';
import { Label } from './components/ui/label';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import {
  SelectItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from './components/ui/select';
import { Checkbox } from './components/ui/checkbox';
import { Button } from './components/ui/button';
import { projectMutation } from './project-mutation';
import { useRef, useState } from 'react';
import { type Functions } from 'firebase/functions';
import { text } from './data';
import { ProjectArchive } from './ProjectArchive';
import { ProjectDeletion } from './ProjectDeletion';
import { ownsVisibleProject } from './project-deletion';
import { ProjectTopics } from './ProjectTopics';
import { ProjectSelector } from './ProjectSelector';
import { useProjects } from './useProjects';
import { getAuth } from 'firebase/auth';
import { safeProject, usePrivacy } from './privacy';
export function ProjectEditor({
  functions,
  projectId,
  project,
  hidden,
  uid,
  onDeleted,
}: {
  functions: Functions;
  projectId: string;
  project?: Record<string, unknown>;
  hidden: boolean;
  uid: string;
  onDeleted: () => void;
}) {
  if (hidden)
    return (
      <Alert className="my-2">
        <AlertDescription>
          Metadados e gerenciamento ocultos na apresentação atual. O alias
          exibido é neutro; esta ofuscação visual não altera acesso.
        </AlertDescription>
      </Alert>
    );
  if (!project)
    return (
      <Alert className="my-2">
        <AlertDescription>
          Metadados não disponíveis nesta lista limitada. Não é possível editar
          sem conferir o projeto.
        </AlertDescription>
      </Alert>
    );
  return (
    <div className="my-6 space-y-4">
      <ProjectArchive
        functions={functions}
        projectId={projectId}
        project={project}
      />
      {
        <ProjectForm
          key={projectId}
          functions={functions}
          projectId={projectId}
          project={project}
        />
      }
      <ProjectTopics
        key={'topics/' + projectId}
        functions={functions}
        projectId={projectId}
        project={project}
      />
      {ownsVisibleProject(uid, project, hidden) && (
        <ProjectDeletion
          key={JSON.stringify([uid, projectId, project])}
          functions={functions}
          uid={uid}
          projectId={projectId}
          project={project}
          onDeleted={onDeleted}
        />
      )}
    </div>
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
  const catalog = useProjects(
    functions,
    getAuth(functions.app).currentUser?.uid ?? '',
  );
  const { revealed } = usePrivacy();
  const [title, setTitle] = useState(text(project.title, ''));
  const [description, setDescription] = useState(text(project.description, ''));
  const type = project.type === 'personal' ? 'personal' : 'work';
  const [githubUrl, setGithubUrl] = useState(text(project.githubUrl, ''));
  const confidential = project.confidential === true;
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
        alias,
        reason,
      });
      if (saveIntent.current?.key !== key)
        saveIntent.current = { key, requestId: crypto.randomUUID() };
      await projectMutation(
        functions,
        'updateProject',
      )({
        projectId,
        title,
        description,
        githubUrl: githubUrl || null,
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
      const result = await projectMutation(
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
    <div className="rounded-xl border bg-card p-4 text-card-foreground">
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Editar metadados</h3>
        {error && (
          <Alert variant="destructive" className="my-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert role="status" className="my-2">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectEditor-6609'}>{'Título'}</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            id={'ProjectEditor-6609'}
          ></Input>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectEditor-6767'}>{'Descrição'}</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            id={'ProjectEditor-6767'}
            rows={3}
          ></Textarea>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectEditor-6982'}>{'Tipo'}</Label>
          <Select value={type} disabled={true}>
            <SelectTrigger id={'ProjectEditor-6982'}>
              <SelectValue placeholder={'Tipo'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={'personal'}>
                Pessoal · somente o dono
              </SelectItem>
              <SelectItem value={'work'}>Compartilhado · empresa</SelectItem>
            </SelectContent>
          </Select>
          <p
            id="ProjectEditor-6982-help"
            className="text-xs text-muted-foreground"
          >
            {'Gerencie o escopo em Acesso e apresentação no topo.'}
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectEditor-7387'}>{'GitHub HTTPS'}</Label>
          <Input
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            disabled={busy}
            id={'ProjectEditor-7387'}
          ></Input>
        </div>
        <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
          <Checkbox checked={confidential} disabled={true} />
          <span>
            {'Confidencialidade: gerencie em Acesso e apresentação no topo'}
          </span>
        </Label>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectEditor-7740'}>{'Alias público neutro'}</Label>
          <Input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            disabled={busy}
            id={'ProjectEditor-7740'}
            aria-describedby={'ProjectEditor-7740-help'}
          ></Input>
          <p
            id="ProjectEditor-7740-help"
            className="text-xs text-muted-foreground"
          >
            {
              'Não use nome de cliente, sigla ou termos que revelem o projeto. Modo live usa rótulo genérico seguro.'
            }
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectEditor-8037'}>{'Motivo'}</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy || !!job}
            id={'ProjectEditor-8037'}
          ></Input>
        </div>
        <Button
          onClick={() => void save()}
          disabled={busy}
          variant="default"
          className="min-h-11"
        >
          Salvar metadados
        </Button>
        <h3 className="text-lg font-semibold">
          Mesclar projeto — operação explícita
        </h3>
        <Alert className="my-2">
          <AlertDescription>
            Se origem ou destino for confidencial, destino ficará confidencial.
            Origem: este projeto. Escolha um destino autorizado. Preview não
            altera dados. Execução migra um lote por clique, preserva originais
            e arquiva origem ao concluir; não há execução automática.
          </AlertDescription>
        </Alert>
        <ProjectSelector
          key={getAuth(functions.app).currentUser?.uid + String(revealed)}
          label={'Projeto destino'}
          projects={catalog.rows
            .filter((row) => row.id !== projectId)
            .map((row) => ({
              id: row.id,
              label: text(
                safeProject(row.data, revealed).title,
                'Projeto reservado',
              ),
              searchText:
                text(row.data.title, '') + ' ' + text(row.data.description, ''),
            }))}
          projectId={target}
          allowAll={false}
          loading={catalog.loading}
          error={catalog.error}
          disabled={busy || !!job}
          onChange={(id) => {
            setTarget(id);
            setPreview(null);
            setConfirmed(false);
          }}
        />
        <Button
          onClick={() => void merge(false)}
          disabled={busy || !!job}
          variant="ghost"
          className="min-h-11"
        >
          Consultar preview sem alteração
        </Button>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={'ProjectEditor-9773'}>
            {'requestId de recuperação (copie antes de executar)'}
          </Label>
          <Input
            value={mergeId}
            disabled={busy || !!job}
            onChange={(e) => setMergeId(e.target.value)}
            id={'ProjectEditor-9773'}
            aria-describedby={'ProjectEditor-9773-help'}
          ></Input>
          <p
            id="ProjectEditor-9773-help"
            className="text-xs text-muted-foreground"
          >
            {
              'Guarde este ID, IDs origem/destino e motivo original fora da tela. Após reload, informe os mesmos valores para retomar ou cancelar. Nenhum motivo é salvo no navegador.'
            }
          </p>
        </div>
        <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
          <Checkbox
            checked={recover}
            disabled={busy || !!job}
            onCheckedChange={(checked) => setRecover(checked === true)}
          />
          <span>
            {
              'Recuperar intenção anterior usando o mesmo requestId, destino e motivo'
            }
          </span>
        </Label>
        {(preview || recover) && (
          <>
            <p className="text-sm leading-relaxed">
              Registros previstos: {preview?.count ?? 'Consultar preview'}.
              Mapeamentos de tópicos:{' '}
              {preview?.topicMapping.length ?? 'não consultado'}.
            </p>
            {preview?.topicMapping.map((map, index) => (
              <p key={index} className="text-sm">
                {map.sourceTopicId}→ {map.targetTopicId}
              </p>
            ))}
            {preview?.warnings.map((warning, index) => (
              <Alert key={index} className="my-2">
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}
            <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
              <Checkbox
                checked={confirmed}
                disabled={busy}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <span>
                {
                  'Confirmo origem, destino e migração explícita após conferir preview'
                }
              </span>
            </Label>
            <Button
              disabled={
                busy ||
                !confirmed ||
                job?.status === 'completed' ||
                job?.status === 'cancelled'
              }
              onClick={() => void merge(true)}
              variant="default"
              className="min-h-11"
            >
              {job?.hasMore
                ? 'Retomar próximo lote'
                : 'Executar lote confirmado'}
            </Button>
          </>
        )}
        {(job?.status === 'running' || recover) && (
          <>
            <Alert className="my-2">
              <AlertDescription>
                Cancelar libera os locks, mas NÃO desfaz lotes já migrados. A
                migração parcial permanecerá. Job cancelado não pode ser
                retomado.
              </AlertDescription>
            </Alert>
            <Label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
              <Checkbox
                checked={cancelConfirmed}
                disabled={busy}
                onCheckedChange={(checked) =>
                  setCancelConfirmed(checked === true)
                }
              />
              <span>
                {'Confirmo cancelar sem rollback dos lotes já migrados'}
              </span>
            </Label>
            <Button
              disabled={
                busy ||
                !cancelConfirmed ||
                !confirmed ||
                job?.status === 'completed' ||
                job?.status === 'cancelled'
              }
              onClick={() => void merge(true, true)}
              variant="destructive"
              className="min-h-11"
            >
              Cancelar job sem rollback
            </Button>
          </>
        )}
        {job && (
          <Alert className="my-2">
            <AlertDescription>
              Job {job.jobId}: {job.status}; {job.migratedCount}registros
              migrados.{' '}
              {job.hasMore
                ? 'Há mais lotes; retome explicitamente.'
                : 'Sem lotes restantes informados.'}
            </AlertDescription>
          </Alert>
        )}
        {busy && (
          <p role={'status'} className="text-sm leading-relaxed">
            Aguardando operação…
          </p>
        )}
      </div>
    </div>
  );
}
