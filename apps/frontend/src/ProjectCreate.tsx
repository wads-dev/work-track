import { Button } from './components/ui/button';
import { DialogTitle, Dialog, DialogContent } from './components/ui/dialog';
import {
  SelectItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from './components/ui/select';
import { Label } from './components/ui/label';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Alert, AlertDescription } from './components/ui/alert';
import { projectMutation } from './project-mutation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { type Functions } from 'firebase/functions';
export function ProjectCreate({
  functions,
  onCreated,
}: {
  functions: Functions;
  onCreated: (id: string, type: 'personal' | 'work') => void;
}) {
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [type, setType] = useState<'' | 'personal' | 'work'>(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!type) return;
    setBusy(true);
    setError('');
    try {
      const result = await projectMutation<
        { title: string; description: string; type: 'personal' | 'work' },
        { id: string }
      >(
        functions,
        'createProject',
      )({ title, description, type });
      onCreated(result.data.id, type);
      setOpen(false);
      setTitle('');
      setDescription('');
      setType('');
    } catch {
      setError(
        'Não foi possível criar o projeto. Revise os dados ou tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        aria-label={'Novo projeto'}
        aria-haspopup={'dialog'}
        aria-controls={open ? 'create-project-dialog' : undefined}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        variant="default"
        className="fixed bottom-[calc(24px+env(safe-area-inset-bottom))] right-4 z-40 rounded-full shadow-lg sm:right-6"
      >
        <Plus size={20} aria-hidden={'true'} style={{ marginRight: 8 }} />
        Novo projeto
      </Button>
      <Dialog
        open={open}
        onOpenChange={(open) => {
          if (!open)
            (() => {
              if (!busy) setOpen(false);
            })();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          id={'create-project-dialog'}
          aria-labelledby={'create-project-title'}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        >
          <DialogTitle id={'create-project-title'}>Criar projeto</DialogTitle>
          <form
            id={'create-project-panel'}
            onSubmit={submit}
            className="space-y-4"
          >
            <div className="flex flex-col gap-4">
              <div className="min-w-0 space-y-2">
                <Label htmlFor={'ProjectCreate-2689'}>{'Tipo de acesso'}</Label>
                <Select
                  value={type}
                  disabled={busy}
                  required={true}
                  onValueChange={(value) => setType(value as typeof type)}
                >
                  <SelectTrigger id={'ProjectCreate-2689'} autoFocus>
                    <SelectValue placeholder={'Tipo de acesso'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={'personal'}>
                      Pessoal · somente o dono
                    </SelectItem>
                    <SelectItem value={'work'}>
                      Corporativo · compartilhado com a empresa
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p
                  id="ProjectCreate-2689-help"
                  className="text-xs text-muted-foreground"
                >
                  {
                    'Escolha explicitamente. O tipo não poderá ser convertido na edição comum.'
                  }
                </p>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={'ProjectCreate-3394'}>{'Título'}</Label>
                <Input
                  required={true}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                  id={'ProjectCreate-3394'}
                  minLength={2}
                  maxLength={160}
                ></Input>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={'ProjectCreate-3673'}>
                  {'Descrição do escopo'}
                </Label>
                <Textarea
                  required={true}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                  id={'ProjectCreate-3673'}
                  rows={3}
                  minLength={20}
                  maxLength={6000}
                  aria-describedby={'ProjectCreate-3673-help'}
                ></Textarea>
                <p
                  id="ProjectCreate-3673-help"
                  className="text-xs text-muted-foreground"
                >
                  {'Descreva o escopo com pelo menos 20 caracteres.'}
                </p>
              </div>
              <p className="text-sm">
                Confidencialidade visual pode ser configurada nos detalhes; ela
                não substitui o acesso pessoal somente ao dono.
              </p>
              {error && (
                <Alert variant="destructive" className="my-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button
                disabled={busy}
                onClick={() => setOpen(false)}
                variant="ghost"
                className="min-h-11"
              >
                Cancelar
              </Button>
              <Button
                type={'submit'}
                disabled={
                  busy ||
                  !type ||
                  title.trim().length < 2 ||
                  description.trim().length < 20
                }
                variant="default"
                className="min-h-11"
              >
                {busy ? 'Criando…' : 'Criar projeto'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
