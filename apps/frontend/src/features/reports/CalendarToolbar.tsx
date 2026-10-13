import type { ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { ProjectSelector } from '../projects/ProjectSelector';
import type { ProjectOption } from '../projects/project-search';
import { QueryToolbar } from '../../shared/ui/QueryToolbar';
import { UiIcon } from '../../shared/ui/UiIcons';
import { layoutTokens } from '../../shared/ui/layout-tokens';
import { cn } from '../../lib/utils';

type Option = {
  value: string;
  label: ReactNode;
  text: string;
  disabled?: boolean;
};
/** Every calendar filter uses the same design-system Select and popper behavior. */
function CalendarSelect({
  label,
  value,
  options,
  selected,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Option[];
  selected?: ReactNode;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selectedOption = new Map(
    options.map((option) => [option.value, option]),
  ).get(value);
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        title={selectedOption?.text}
        className={cn('max-w-full', layoutTokens.controlHeight)}
      >
        <SelectValue>{selected ?? selectedOption?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            textValue={option.text}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CalendarToolbar({
  date,
  view,
  density,
  allWeeks,
  projectId,
  projects,
  projectsLoading,
  projectsError,
  personId,
  personOptions,
  personAvatar,
  personDisabled,
  subject,
  topics,
  includeArchived,
  onDate,
  onMove,
  onView,
  onDensity,
  onPerson,
  onProject,
  onSubject,
  onArchived,
  onRefresh,
}: {
  date: string;
  view: string;
  density: string;
  allWeeks: boolean;
  projectId: string;
  projects: ProjectOption[];
  projectsLoading: boolean;
  projectsError: string;
  personId: string;
  personOptions: Option[];
  personAvatar: ReactNode;
  personDisabled: boolean;
  subject: string;
  topics: { id: string; label: string }[];
  includeArchived: boolean;
  onDate: (value: string) => void;
  onMove: (direction: number) => void;
  onView: (value: string) => void;
  onDensity: (value: string) => void;
  onPerson: (value: string) => void;
  onProject: (value: string) => void;
  onSubject: (value: string) => void;
  onArchived: () => void;
  onRefresh: () => void;
}) {
  return (
    <QueryToolbar
      label="Filtros do calendário"
      compact
      actions={
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Incluir arquivados"
                aria-pressed={includeArchived}
                onClick={onArchived}
              >
                <UiIcon kind={includeArchived ? 'archive' : 'archiveoff'} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {includeArchived ? 'Ocultar arquivados' : 'Incluir arquivados'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Atualizar calendário"
                onClick={onRefresh}
              >
                <UiIcon kind="refresh" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Atualizar calendário</TooltipContent>
          </Tooltip>
        </>
      }
    >
      <div
        role="group"
        aria-label="Data e navegação do calendário"
        data-calendar-date
        className={cn(
          'flex shrink-0 items-center overflow-hidden rounded-md border border-input bg-transparent shadow-xs focus-within:ring-2 focus-within:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50',
          layoutTokens.controlHeight,
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Período anterior"
          disabled={allWeeks}
          onClick={() => onMove(-1)}
          className="rounded-none border-r"
        >
          <UiIcon kind="previous" />
        </Button>
        <Input
          aria-label="Referência"
          type="date"
          value={date}
          disabled={allWeeks}
          onChange={(event) => onDate(event.target.value)}
          className="w-36 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próximo período"
          disabled={allWeeks}
          onClick={() => onMove(1)}
          className="rounded-none border-l"
        >
          <UiIcon kind="next" />
        </Button>
      </div>
      <CalendarSelect
        label="Visualização"
        value={allWeeks ? 'all' : view}
        onChange={onView}
        options={[
          { value: 'day', label: 'Dia', text: 'Dia' },
          {
            value: 'three-days',
            label: 'Últimos três dias',
            text: 'Últimos três dias',
          },
          { value: 'week', label: 'Semana', text: 'Semana' },
          { value: 'month', label: 'Mês', text: 'Mês' },
          {
            value: 'all',
            label: 'Semanas com atividade',
            text: 'Semanas com atividade',
            disabled: !projectId,
          },
        ]}
      />
      <div data-calendar-person className="shrink-0">
        <CalendarSelect
          label="Pessoa"
          value={personId}
          options={personOptions}
          selected={personAvatar}
          disabled={personDisabled}
          onChange={onPerson}
        />
      </div>
      <ProjectSelector
        projects={projects}
        projectId={projectId}
        loading={projectsLoading}
        error={projectsError}
        onChange={onProject}
        className="w-[200px] space-y-0 sm:w-[200px] [&>label]:sr-only"
      />
      {projectId && (
        <CalendarSelect
          label="Tópico"
          value={subject || '__all__'}
          onChange={(value) => onSubject(value === '__all__' ? '' : value)}
          options={[
            {
              value: '__all__',
              label: 'Todos os tópicos',
              text: 'Todos os tópicos',
            },
            ...topics.map((topic) => ({
              value: topic.id,
              label: topic.label,
              text: topic.label,
            })),
          ]}
        />
      )}
      <CalendarSelect
        label="Densidade"
        value={density}
        onChange={onDensity}
        disabled={allWeeks}
        options={[
          { value: 'timeline', label: 'Régua', text: 'Régua' },
          { value: 'compact', label: 'Compacto', text: 'Compacto' },
          {
            value: 'supercompact',
            label: 'Supercompacto',
            text: 'Supercompacto',
          },
        ]}
      />
    </QueryToolbar>
  );
}
