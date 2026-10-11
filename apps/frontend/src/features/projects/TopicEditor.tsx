import { useRef, useState } from 'react';
import type { Functions } from 'firebase/functions';
import { projectMutation } from '../../infrastructure/firebase/project-mutation';
import { githubUrl as githubSchema } from '@work-track/core/registration/domain/project-management';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Alert } from '../../components/ui/alert';
import { text } from '../../shared/data';

export function TopicEditor({
  functions,
  projectId,
  topicId,
  topic,
  disabled = false,
}: {
  functions: Functions;
  projectId: string;
  topicId: string;
  topic: Record<string, unknown>;
  disabled?: boolean;
}) {
  const [title, setTitle] = useState(text(topic.title, ''));
  const [description, setDescription] = useState(text(topic.description, ''));
  const [githubUrl, setGithubUrl] = useState(text(topic.githubUrl, ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const intent = useRef<{ key: string; requestId: string } | null>(null);
  async function save() {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!title.trim()) throw Error('Informe o título do tópico.');
      if (githubUrl && !githubSchema.safeParse(githubUrl).success)
        throw Error('Use HTTPS github.com/owner/repo, sem query ou fragmento.');
      const changes = {
        projectId,
        topicId,
        title: title.trim(),
        description,
        githubUrl: githubUrl || null,
      };
      const key = JSON.stringify(changes);
      if (intent.current?.key !== key)
        intent.current = { key, requestId: crypto.randomUUID() };
      await projectMutation(
        functions,
        'updateTopic',
      )({
        ...changes,
        requestId: intent.current.requestId,
        reason: 'Edição de dados básicos do tópico pela interface web.',
      });
      intent.current = null;
      setMessage('Alterações salvas.');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Falha ao salvar tópico.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      aria-label="Dados básicos do tópico"
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-lg font-semibold">Dados básicos do tópico</h2>
      {error && <Alert variant="destructive">{error}</Alert>}
      {message && <Alert role="status">{message}</Alert>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="topic-title">Título do tópico</Label>
          <Input
            id="topic-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy || disabled}
            required
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="topic-github">Repositório GitHub</Label>
          <Input
            id="topic-github"
            type="url"
            placeholder="https://github.com/organização/repositório"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            disabled={busy || disabled}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="topic-description">Descrição</Label>
          <Textarea
            id="topic-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy || disabled}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || disabled}>
          {busy ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
