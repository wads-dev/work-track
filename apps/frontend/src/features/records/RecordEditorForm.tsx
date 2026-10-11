import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert';
import { ProjectSelector } from '../projects/ProjectSelector';
import { objects, text, type Row } from '../../shared/data';
import { isHidden, safeProject } from '../../shared/ui/privacy';
export type EditedTopic = {
  topicId: string;
  percentage?: number;
  durationMinutes?: number;
};
export function RecordEditorForm({
  catalog,
  revealed,
  projectId,
  topics,
  start,
  end,
  description,
  busy,
  focusEnd,
  sharing,
  ack,
  onProject,
  onTopics,
  onStart,
  onEnd,
  onDescription,
  onAck,
  onSave,
}: {
  catalog: Row[];
  revealed: boolean;
  projectId: string;
  topics: EditedTopic[];
  start: string;
  end: string;
  description: string;
  busy: boolean;
  focusEnd: boolean;
  sharing: boolean;
  ack: boolean;
  onProject: (id: string) => void;
  onTopics: (topics: EditedTopic[]) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onDescription: (value: string) => void;
  onAck: (value: boolean) => void;
  onSave: () => void;
}) {
  const project = catalog.find((row) => row.id === projectId)?.data;
  const hidden = isHidden(project, revealed);
  const available = objects(project?.topics).filter(
    (t) =>
      (!t.archived && !t.mergedIntoTopicId) ||
      topics.some((selected) => selected.topicId === t.id),
  );
  return (
    <form
      id="record-edit-form"
      aria-label="Editar registro"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-5 rounded-xl border bg-card p-4 sm:p-5"
    >
      <h3 className="text-base font-semibold">Editar registro</h3>
      <ProjectSelector
        label="Projeto"
        className="w-full sm:w-full"
        allowAll={false}
        disabled={busy}
        projectId={projectId}
        projects={catalog
          .filter(
            (row) =>
              row.id === projectId ||
              (!isHidden(row.data, revealed) &&
                !row.data.archived &&
                !row.data.mergedInto &&
                !row.data.mergeLock),
          )
          .map((row) => ({
            id: row.id,
            label: text(safeProject(row.data, revealed).title),
            searchText: text(safeProject(row.data, revealed).title),
          }))}
        onChange={onProject}
      />
      {hidden ? (
        <Alert>
          <AlertDescription>
            Revele o projeto autorizado para editar seus tópicos.
          </AlertDescription>
        </Alert>
      ) : (
        <fieldset disabled={busy} className="min-w-0 space-y-2">
          <legend className="mb-2 text-sm font-medium">Tópicos</legend>
          <div className="flex min-w-0 flex-wrap gap-2">
            {available.map((t) => {
              const selected = topics.find((item) => item.topicId === t.id);
              return (
                <Label
                  key={text(t.id)}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm [overflow-wrap:anywhere]"
                >
                  <Checkbox
                    checked={!!selected}
                    onCheckedChange={(checked) =>
                      onTopics(
                        checked === true
                          ? [...topics, { topicId: text(t.id) }]
                          : topics.filter((item) => item.topicId !== t.id),
                      )
                    }
                  />
                  {text(t.title)}
                  {selected?.percentage !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {selected.percentage}%
                    </span>
                  )}
                  {selected?.durationMinutes !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {selected.durationMinutes} min
                    </span>
                  )}
                </Label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {topics.length === 0
              ? 'Selecione pelo menos um tópico.'
              : 'As divisões já informadas são preservadas nos tópicos selecionados.'}
          </p>
        </fieldset>
      )}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2" data-record-period>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="record-edit-start">Início</Label>
          <Input
            id="record-edit-start"
            className="min-w-0 w-full"
            type="datetime-local"
            required
            value={start}
            disabled={busy}
            onChange={(e) => onStart(e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="record-edit-end">Fim</Label>
          <Input
            id="record-edit-end"
            className="min-w-0 w-full"
            type="datetime-local"
            autoFocus={focusEnd}
            value={end}
            disabled={busy}
            onChange={(e) => onEnd(e.target.value)}
            aria-describedby="record-end-help"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="record-end-help" className="text-xs text-muted-foreground">
              {end
                ? 'Deixe sem fim para manter o registro em aberto.'
                : 'Sem fim: o registro ficará em aberto ao salvar.'}
            </p>
            {end && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onEnd('')}
              >
                Deixar em aberto
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="record-edit-description">Descrição / contexto</Label>
        <Textarea
          id="record-edit-description"
          className="min-h-28"
          value={description}
          disabled={busy}
          onChange={(e) => onDescription(e.target.value)}
        />
      </div>
      {sharing && (
        <Alert>
          <AlertTitle>Este registro será compartilhado</AlertTitle>
          <AlertDescription>
            A mudança para um projeto compartilhado publica o texto original
            completo e o contexto para os usuários autorizados da organização.
            <Label className="mt-2 flex items-start gap-2">
              <Checkbox
                checked={ack}
                disabled={busy}
                onCheckedChange={(checked) => onAck(checked === true)}
              />
              Autorizo compartilhar este registro com a organização.
            </Label>
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
