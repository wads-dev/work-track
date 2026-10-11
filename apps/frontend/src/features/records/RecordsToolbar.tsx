import { CompactListToolbar } from '../../shared/ui/CompactListToolbar';
import { ProjectSelector } from '../projects/ProjectSelector';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { objects, text, type Row } from '../../shared/data';
import { safeProject } from '../../shared/ui/privacy';
export function RecordsToolbar({
  catalog,
  revealed,
  loading,
  error,
  params,
  search,
  onFilter,
  onClear,
}: {
  catalog: Row[];
  revealed: boolean;
  loading: boolean;
  error: string;
  params: URLSearchParams;
  search: string;
  onFilter: (key: string, value: string) => void;
  onClear: () => void;
}) {
  const project = params.get('project') ?? '';
  const topics = objects(
    safeProject(catalog.find((row) => row.id === project)?.data, revealed)
      .topics,
  );
  return (
    <CompactListToolbar
      label="Filtros de registros"
      searchLabel="Pesquisar registros"
      searchPlaceholder="Pesquisar registros…"
      search={search}
      onSearchChange={(value) => onFilter('q', value)}
      actionLabel="Limpar filtros"
      onAction={onClear}
      leading={
        <div className="grid min-w-0 grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          <Input
            aria-label="Data inicial"
            type="date"
            className="min-w-0 w-full sm:w-36"
            value={params.get('fromDate') ?? ''}
            onChange={(e) => onFilter('fromDate', e.target.value)}
          />
          <Input
            aria-label="Data final"
            type="date"
            className="min-w-0 w-full sm:w-36"
            value={params.get('toDate') ?? ''}
            onChange={(e) => onFilter('toDate', e.target.value)}
          />
          <ProjectSelector
            className="min-w-0 w-full sm:w-48 [&>label]:sr-only [&>label]:m-0 [&>label]:p-0 space-y-0"
            projects={catalog.map((row) => {
              const p = safeProject(row.data, revealed);
              return {
                id: row.id,
                label: text(p.title, 'Projeto reservado'),
                searchText: text(p.title, '') + ' ' + text(p.description, ''),
              };
            })}
            projectId={project}
            loading={loading}
            error={error}
            onChange={(id) => onFilter('project', id)}
          />
          <Select
            value={params.get('topic') || '__all__'}
            disabled={!project}
            onValueChange={(value) =>
              onFilter('topic', value === '__all__' ? '' : value)
            }
          >
            <SelectTrigger
              aria-label="Tópico"
              className="min-w-0 w-full sm:w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os tópicos</SelectItem>
              {topics.map((topic) => (
                <SelectItem key={text(topic.id)} value={text(topic.id)}>
                  {text(topic.title)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
}
