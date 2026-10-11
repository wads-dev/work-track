import type { ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { UiIcon } from './UiIcons';

/** Compact list controls shared by the Projects and People directories. */
export function CompactListToolbar({
  label,
  leading,
  filters,
  searchLabel,
  searchPlaceholder,
  search,
  onSearchChange,
  actionLabel,
  onAction,
  disabled = false,
}: {
  label: string;
  leading?: ReactNode;
  filters?: ReactNode;
  searchLabel: string;
  searchPlaceholder: string;
  search: string;
  onSearchChange: (value: string) => void;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center"
    >
      {leading}
      <div className="flex min-w-0 items-center gap-2 lg:flex-1">
        {filters}
        <Input
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          className="min-w-0 flex-1"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label={actionLabel}
              disabled={disabled}
              onClick={onAction}
            >
              <UiIcon kind="refresh" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{actionLabel}</TooltipContent>
        </Tooltip>
      </div>
    </section>
  );
}
