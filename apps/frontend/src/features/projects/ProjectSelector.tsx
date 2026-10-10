import { useId, useMemo, useState } from 'react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { matchesProject, type ProjectOption } from './project-search';
export function ProjectSelector({
  projects,
  projectId,
  onChange,
  loading = false,
  error = '',
  label = 'Projeto',
  className,
  allowAll = true,
  disabled = false,
}: {
  projects: ProjectOption[];
  projectId: string;
  onChange: (id: string) => void;
  loading?: boolean;
  error?: string;
  label?: string;
  className?: string;
  allowAll?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const options = useMemo(
    () =>
      allowAll
        ? [{ id: '', label: 'Todos os projetos' }, ...projects]
        : projects,
    [projects, allowAll],
  );
  const selected = options.find((option) => option.id === projectId) ?? {
    id: projectId,
    label: projectId ? 'Projeto não disponível' : 'Escolha o projeto',
  };
  const [input, setInput] = useState<{
    id: string;
    label: string;
    query: string;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputValue =
    input?.id === projectId && input.label === selected.label
      ? input.query
      : selected.label;
  // The selected label is display text, not a user-entered search query.
  const searchQuery =
    input?.id === projectId && input.label === selected.label
      ? input.query
      : '';
  const filtered = options.filter((option) =>
    matchesProject(option, searchQuery),
  );
  function choose(option: ProjectOption) {
    setInput(null);
    setOpen(false);
    setActive(-1);
    onChange(option.id);
  }
  return (
    <div
      className={cn('relative w-full min-w-0 space-y-1.5 sm:w-60', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setInput(null);
          setActive(-1);
        }
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id + '-list'}
          aria-activedescendant={
            open && active >= 0 && filtered[active]
              ? id + '-option-' + active
              : undefined
          }
          aria-invalid={!!error}
          aria-describedby={error ? id + '-error' : undefined}
          placeholder="Pesquisar projeto"
          disabled={disabled}
          value={inputValue}
          onFocus={(event) => {
            setOpen(true);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setInput({
              id: projectId,
              label: selected.label,
              query: event.target.value,
            });
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActive((previous) =>
                filtered.length
                  ? event.key === 'ArrowDown'
                    ? (previous + 1) % filtered.length
                    : previous <= 0
                      ? filtered.length - 1
                      : previous - 1
                  : -1,
              );
            } else if (
              event.key === 'Enter' &&
              open &&
              active >= 0 &&
              filtered[active]
            ) {
              event.preventDefault();
              choose(filtered[active]);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              setInput(null);
              setActive(-1);
            }
          }}
        />
        {projectId && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Limpar projeto"
            disabled={disabled}
            onClick={() => {
              setInput(null);
              onChange('');
            }}
          >
            ×
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={open ? 'Fechar projetos' : 'Pesquisar projetos'}
          disabled={disabled}
          onClick={() => {
            setOpen(!open);
            setActive(-1);
          }}
        >
          ⌄
        </Button>
      </div>
      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <ul
            id={id + '-list'}
            role="listbox"
            aria-label={label}
            aria-busy={loading}
          >
            {filtered.map((option, index) => (
              <li
                key={option.id}
                id={id + '-option-' + index}
                role="option"
                aria-selected={option.id === projectId}
                className={cn(
                  'cursor-pointer rounded-sm px-3 py-2 text-sm [overflow-wrap:anywhere]',
                  active === index && 'bg-accent text-accent-foreground',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(option)}
              >
                {option.label}
              </li>
            ))}
          </ul>
          {!filtered.length && (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              {loading ? 'Carregando projetos…' : 'Nenhum projeto encontrado'}
            </p>
          )}
        </div>
      )}
      {error && (
        <p id={id + '-error'} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
