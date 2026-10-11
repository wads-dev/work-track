import { useId, useMemo, useRef, useState } from 'react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';
import { matchesProject, type ProjectOption } from './project-search';

// Radix reserves the empty string for its placeholder. Prefix real IDs so the
// "all" option cannot collide with any project ID, while keeping the public API.
const allValue = 'all';
const selectValue = (id: string) => (id ? 'project:' + id : allValue);

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
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const focusSearchOnOpen = useRef(false);
  const retainSearchFocus = useRef(false);
  const tabDirection = useRef<1 | -1 | null>(null);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
  const filtered = options.filter((option) =>
    matchesProject(option, searchQuery),
  );
  function changeOpen(next: boolean) {
    focusSearchOnOpen.current = next;
    retainSearchFocus.current = next;
    setSearchQuery('');
    setOpen(next);
  }
  function choose(value: string) {
    onChange(value === allValue ? '' : value.slice('project:'.length));
    changeOpen(false);
  }
  return (
    <div className={cn('w-full min-w-0 space-y-1.5 sm:w-60', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={projectId || allowAll ? selectValue(projectId) : ''}
        onValueChange={choose}
        open={open && !disabled}
        onOpenChange={changeOpen}
        disabled={disabled}
      >
        <SelectTrigger
          ref={triggerRef}
          id={id}
          className="w-full min-w-0"
          aria-invalid={!!error}
          aria-describedby={error ? id + '-error' : undefined}
          aria-busy={loading}
        >
          <SelectValue
            className="min-w-0 flex-1 text-left"
            placeholder="Escolha o projeto"
          >
            {selected.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          ref={contentRef}
          className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]"
          aria-label={label}
          aria-busy={loading}
          onFocusCapture={(event) => {
            // Radix focuses after positioning and again if a live catalog
            // removes its selected item. Preserve input focus until the user
            // deliberately navigates to an option, not on every re-render.
            if (event.target === searchRef.current) {
              retainSearchFocus.current = true;
            } else if (focusSearchOnOpen.current || retainSearchFocus.current) {
              focusSearchOnOpen.current = false;
              searchRef.current?.focus({ preventScroll: true });
            }
          }}
          onPointerMoveCapture={(event) => {
            if ((event.target as HTMLElement).closest('[role="option"]')) {
              retainSearchFocus.current = false;
            }
          }}
          onPointerDownCapture={(event) => {
            if ((event.target as HTMLElement).closest('[role="option"]')) {
              retainSearchFocus.current = false;
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Tab') {
              // Radix traps Tab in a Select; a searchable menu must let the user
              // leave it. Complete traversal after its focus scope unmounts.
              event.preventDefault();
              tabDirection.current = event.shiftKey ? -1 : 1;
              changeOpen(false);
            } else if (
              event.target !== searchRef.current &&
              event.key === 'ArrowUp' &&
              event.target ===
                contentRef.current?.querySelector(
                  '[role="option"]:not([data-disabled])',
                )
            ) {
              event.preventDefault();
              searchRef.current?.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (tabDirection.current === null) return;
            event.preventDefault();
            const direction = tabDirection.current;
            tabDirection.current = null;
            const trigger = triggerRef.current;
            const focusable = Array.from(
              document.querySelectorAll<HTMLElement>(
                'button, a[href], input, select, textarea, [tabindex]',
              ),
            ).filter(
              (element) =>
                element.tabIndex >= 0 &&
                !element.matches(':disabled') &&
                !element.closest('[inert], [aria-hidden="true"]') &&
                !contentRef.current?.contains(element) &&
                element.getClientRects().length > 0,
            );
            const index = trigger ? focusable.indexOf(trigger) : -1;
            (focusable[index + direction] ?? trigger)?.focus();
          }}
        >
          <div className="sticky top-0 z-10 bg-popover p-1 pb-2">
            <Input
              ref={searchRef}
              aria-label={'Pesquisar ' + label.toLocaleLowerCase()}
              placeholder="Pesquisar projeto"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' || event.key === 'Tab') return;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  if (filtered.length) retainSearchFocus.current = false;
                  return;
                }
                // Preserve text editing (including spaces, Home/End, shortcuts
                // and IME) without feeding Radix's typeahead or stealing focus.
                event.stopPropagation();
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (filtered[0]) choose(selectValue(filtered[0].id));
                }
              }}
            />
          </div>
          {/* Keep item refs stable: removing the selected item while filtering
              makes Radix's positioning effect move focus out of the input. */}
          {options.map((option) => {
            const matches = matchesProject(option, searchQuery);
            return (
              <SelectItem
                key={selectValue(option.id)}
                value={selectValue(option.id)}
                disabled={!matches}
                hidden={!matches}
                className={cn(
                  'whitespace-normal [overflow-wrap:anywhere]',
                  !matches && 'hidden',
                )}
              >
                {option.label}
              </SelectItem>
            );
          })}
          {loading && (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              Carregando projetos…
            </p>
          )}
          {!loading && !filtered.length && (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              Nenhum projeto encontrado
            </p>
          )}
        </SelectContent>
      </Select>
      {error && (
        <p id={id + '-error'} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
