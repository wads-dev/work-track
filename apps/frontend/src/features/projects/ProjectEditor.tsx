import { Alert, AlertDescription } from '../../components/ui/alert';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { ProjectAppearance } from '@work-track/core/registration/domain/project-color';
import { Textarea } from '../../components/ui/textarea';
import { Button } from '../../components/ui/button';
import { projectMutation } from '../../infrastructure/firebase/project-mutation';
import { useRef, useState, type ReactNode } from 'react';
import { type Functions } from 'firebase/functions';
import { text } from '../../shared/data';
import { ProjectDeletion } from './ProjectDeletion';
import { ownsVisibleProject } from './project-deletion';
import { ProjectTopics } from './ProjectTopics';
import { ProjectTimeMultipliers } from './ProjectTimeMultipliers';
import { useProjects } from './hooks/useProjects';
import { getAuth } from 'firebase/auth';
import { safeProject, usePrivacy } from '../../shared/ui/privacy';
export function ProjectEditor({
  functions,
  projectId,
  project,
  hidden,
  uid,
  onDeleted,
  access,
}: {
  functions: Functions;
  projectId: string;
  project?: Record<string, unknown>;
  hidden: boolean;
  uid: string;
  onDeleted: () => void;
  access?: ReactNode;
}) {
  const { revealed } = usePrivacy();
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
    <div className="space-y-4">
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ProjectForm
          key={projectId + String(project.updatedAt) + String(revealed)}
          functions={functions}
          projectId={projectId}
          project={project}
        />
        <div className="min-w-0">{access}</div>
      </div>
      <ProjectTimeMultipliers
        key={projectId + String(project.updatedAt)}
        functions={functions}
        projectId={projectId}
        project={project}
      />
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
  const [githubUrl, setGithubUrl] = useState(text(project.githubUrl, ''));
  const [color, setColor] = useState(text(project.color, ''));
  const [alias, setAlias] = useState(
    text(project.publicAlias, 'Projeto reservado'),
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const saveIntent = useRef<{ key: string; requestId: string } | null>(null);
  async function save() {
    if (
      lock.current ||
      project.archived === true ||
      project.mergedInto ||
      project.mergeLock
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!title.trim()) throw Error('Informe o nome do projeto.');
      if (!/^Projeto reservado(?: [0-9]{1,4})?$/.test(alias))
        throw Error(
          'Alias deve ser Projeto reservado, opcionalmente seguido de número de até 4 dígitos.',
        );
      if (
        githubUrl &&
        !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
          githubUrl,
        )
      )
        throw Error(
          'GitHub deve ser HTTPS github.com/owner/repo, sem query ou fragmento.',
        );
      const key = JSON.stringify({
        projectId,
        title,
        description,
        githubUrl,
        color,
        alias,
      });
      if (saveIntent.current?.key !== key)
        saveIntent.current = { key, requestId: crypto.randomUUID() };
      await projectMutation(
        functions,
        'updateProject',
      )({
        projectId,
        title: title.trim(),
        description,
        githubUrl: githubUrl || null,
        color: color || null,
        publicAlias: alias,
        reason: 'Edição de dados básicos pela interface web.',
        requestId: saveIntent.current.requestId,
      });
      setMessage('Alterações salvas.');
      saveIntent.current = null;
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Falha ao atualizar.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      aria-label="Dados básicos do projeto"
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h3 className="text-lg font-semibold">Dados básicos</h3>
      {error && <Alert variant="destructive">{error}</Alert>}
      {message && <Alert role="status">{message}</Alert>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="project-name">Nome do projeto</Label>
          <Input
            id="project-name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="project-github">Repositório GitHub</Label>
          <Input
            id="project-github"
            type="url"
            placeholder="https://github.com/organização/repositório"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="min-w-0 space-y-2 md:col-span-2">
          <Label htmlFor="project-description">Descrição</Label>
          <Textarea
            id="project-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="project-color">Cor do projeto</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="project-color"
              type="color"
              className="w-14"
              value={new ProjectAppearance({ id: projectId, color }).getColor(
                catalog.rows.map((p) => ({
                  id: p.id,
                  color: safeProject(p.data, revealed).color,
                })),
              )}
              onChange={(e) => setColor(e.target.value)}
              disabled={busy}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setColor('')}
              disabled={busy}
            >
              Automática
            </Button>
            <span className="text-xs text-muted-foreground">
              {color || 'Automática'}
            </span>
          </div>
        </div>
        {project.confidential === true && (
          <div className="min-w-0 space-y-2">
            <Label htmlFor="project-alias">Nome quando oculto</Label>
            <Input
              id="project-alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              disabled={busy}
            />
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={
            busy ||
            project.archived === true ||
            !!project.mergedInto ||
            !!project.mergeLock
          }
        >
          {busy ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
