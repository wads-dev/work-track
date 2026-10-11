import type { ReactNode } from 'react';
import { createContext, useContext, useId } from 'react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';
import { layoutTokens } from './layout-tokens';

const QueryToolbarCompactContext = createContext(false);

/** Shared compact structure and sizing. Consumers supply domain controls. */
export function QueryToolbarField({
  children,
  kind = 'standard',
}: {
  children: ReactNode;
  kind?: 'date' | 'project' | 'search' | 'standard';
}) {
  const compact = useContext(QueryToolbarCompactContext);
  const widths = compact
    ? layoutTokens.compactFieldWidths
    : layoutTokens.fieldWidths;
  return (
    <div
      data-query-field={kind}
      className={cn(
        layoutTokens.field,
        layoutTokens.controls,
        widths[kind],
        compact && layoutTokens.compactFieldLabels,
      )}
    >
      {children}
    </div>
  );
}
export function QueryToolbar({
  label,
  children,
  summary,
  secondary,
  actions,
  className,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  summary?: ReactNode;
  secondary?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Hide field captions accessibly and keep all slots in one wrapping flow. */
  compact?: boolean;
}) {
  return (
    <QueryToolbarCompactContext.Provider value={compact}>
      <section
        aria-label={label}
        data-query-compact={compact}
        className={cn(
          layoutTokens.surface,
          layoutTokens.wrapRow,
          layoutTokens.controls,
          className,
        )}
      >
        <div data-query-row="primary" className="contents">
          {summary && (
            <div
              data-query-slot="summary"
              className={cn(
                'min-w-[130px]',
                !compact && 'w-full basis-full sm:w-auto sm:basis-auto',
              )}
            >
              {summary}
            </div>
          )}
          <div
            data-query-slot="controls"
            className={cn(
              compact ? 'contents' : layoutTokens.wrapRow,
              !compact && 'w-full flex-[1_0_100%] sm:w-auto sm:flex-1',
            )}
          >
            {children}
          </div>
          {actions && (
            <div
              data-query-slot="actions"
              className={cn(
                compact ? 'contents' : layoutTokens.wrapRow,
                !compact &&
                  'order-3 w-full justify-end sm:order-0 sm:ml-auto sm:w-auto',
              )}
            >
              {actions}
            </div>
          )}
        </div>
        {secondary && (
          <div
            data-query-row="secondary"
            className={cn(
              compact ? 'contents' : layoutTokens.wrapRow,
              !compact && 'order-2 w-full border-t pt-2 sm:order-1',
            )}
          >
            {secondary}
          </div>
        )}
      </section>
    </QueryToolbarCompactContext.Provider>
  );
}
export function QueryPeriodControls({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
}: {
  fromDate: string;
  toDate: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <>
      <QueryToolbarField kind="date">
        <div className="space-y-1.5">
          <Label htmlFor={id + '-from'}>Inicial</Label>
          <Input
            id={id + '-from'}
            type="date"
            value={fromDate}
            onChange={(e) => onFromChange(e.target.value)}
          />
        </div>
      </QueryToolbarField>
      <QueryToolbarField kind="date">
        <div className="space-y-1.5">
          <Label htmlFor={id + '-to'}>Final</Label>
          <Input
            id={id + '-to'}
            type="date"
            value={toDate}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
      </QueryToolbarField>
    </>
  );
}
