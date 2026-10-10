import type { ReactNode } from 'react';
import { useId } from 'react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';
/** Shared compact structure and sizing. Consumers supply domain controls. */
export function QueryToolbarField({
  children,
  kind = 'standard',
}: {
  children: ReactNode;
  kind?: 'date' | 'project' | 'search' | 'standard';
}) {
  const widths = {
    date: 'w-[calc(50%-6px)] sm:w-40',
    project: 'w-full sm:w-60',
    search: 'w-full sm:w-[260px]',
    standard: 'w-full sm:w-[180px]',
  };
  return (
    <div
      data-query-field={kind}
      className={cn(
        'min-w-0 shrink-0 [&>*]:w-full [&>*]:min-w-0 [&_input]:h-11 sm:[&_input]:h-10 [&_input]:text-sm',
        widths[kind],
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
}: {
  label: string;
  children: ReactNode;
  summary?: ReactNode;
  secondary?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-3 rounded-xl border bg-card p-4 [&_button:not([role=checkbox])]:min-h-11 sm:[&_button:not([role=checkbox])]:min-h-10',
        className,
      )}
    >
      <div data-query-row="primary" className="contents">
        {summary && (
          <div
            data-query-slot="summary"
            className="w-full min-w-[130px] basis-full sm:w-auto sm:basis-auto"
          >
            {summary}
          </div>
        )}
        <div
          data-query-slot="controls"
          className="flex w-full min-w-0 flex-[1_0_100%] flex-wrap items-center gap-3 sm:w-auto sm:flex-1"
        >
          {children}
        </div>
        {actions && (
          <div
            data-query-slot="actions"
            className="order-3 flex w-full min-w-0 flex-wrap items-center justify-end gap-3 sm:order-0 sm:ml-auto sm:w-auto"
          >
            {actions}
          </div>
        )}
      </div>
      {secondary && (
        <div
          data-query-row="secondary"
          className="order-2 flex w-full min-w-0 flex-wrap items-center gap-3 border-t pt-3 sm:order-1"
        >
          {secondary}
        </div>
      )}
    </section>
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
