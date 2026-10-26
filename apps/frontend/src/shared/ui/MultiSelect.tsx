import { useId, useState, type ReactNode } from 'react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { layoutTokens } from './layout-tokens';
import { searchOptions } from '../../data/repositories/option-search-repository';

export type MultiSelectOption = {
  value: string;
  text: string;
  label: ReactNode;
  searchText?: string;
  disabled?: boolean;
};
export function multiSelectionLabel(
  options: MultiSelectOption[],
  values: readonly string[],
  allLabel: string,
  plural: string,
) {
  if (!values.length) return allLabel;
  if (values.length > 1) return values.length + ' ' + plural;
  return (
    new Map(options.map((option) => [option.value, option.text])).get(
      values[0],
    ) ?? 'Seleção indisponível'
  );
}
/** Shared presentation picker: datasets are selected by repositories, never here. */
export function MultiSelect({
  label,
  values,
  options,
  allLabel,
  plural,
  onChange,
  disabled = false,
  loading = false,
  error = '',
  className,
}: {
  label: string;
  values: readonly string[];
  options: MultiSelectOption[];
  allLabel: string;
  plural: string;
  onChange: (values: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  className?: string;
}) {
  const [search, setSearch] = useState('');
  const id = useId();
  const selected = new Set(values);
  const shown = searchOptions(options, search);
  const summary = multiSelectionLabel(options, values, allLabel, plural);
  return (
    <details
      className={cn('relative shrink-0 max-w-full', className)}
      onToggle={(event) => {
        if (disabled) event.currentTarget.open = false;
      }}
    >
      <summary
        aria-label={label}
        aria-disabled={disabled}
        aria-busy={loading}
        aria-invalid={!!error}
        aria-describedby={error ? id + '-error' : undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
        className={cn(
          'flex cursor-pointer items-center rounded-md border border-input px-3 text-sm shadow-xs',
          layoutTokens.controlHeight,
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {summary}
      </summary>
      {!disabled && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-72 max-w-[90vw] rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
          role="group"
          aria-label={label + ': seleção'}
        >
          <Input
            aria-label={'Pesquisar ' + label.toLowerCase()}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full justify-start"
            aria-pressed={!values.length}
            onClick={() => onChange([])}
          >
            {allLabel} (limpar seleção)
          </Button>
          <p className="text-xs text-muted-foreground">
            {values.length ? summary : allLabel}. Até 100 seleções.
          </p>
          {loading && <p role="status">Carregando opções…</p>}
          {error && (
            <p id={id + '-error'} role="alert">
              {error}
            </p>
          )}
          <div className="mt-2 max-h-64 overflow-auto">
            {shown.map((option, index) => (
              <label
                key={option.value}
                htmlFor={id + '-' + index}
                className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-accent"
              >
                <input
                  id={id + '-' + index}
                  type="checkbox"
                  checked={selected.has(option.value)}
                  disabled={
                    option.disabled ||
                    (!selected.has(option.value) && selected.size >= 100)
                  }
                  onChange={() => {
                    const next = new Set(values);
                    if (next.has(option.value)) next.delete(option.value);
                    else next.add(option.value);
                    onChange([...next].sort());
                  }}
                />
                {option.label}
              </label>
            ))}
            {!loading && !error && !shown.length && (
              <p role="status">Nenhuma opção encontrada.</p>
            )}
          </div>
        </div>
      )}
    </details>
  );
}
