import type { ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { UiIcon } from './UiIcons';
import { FilterBar } from './FilterBar';
import { cn } from '../../lib/utils';

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
  loading = false,
  onRefresh,
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
  loading?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <FilterBar
      label={label}
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
              className={cn(
                'size-9 shrink-0',
                !onRefresh && loading && '[&>svg]:motion-safe:animate-spin',
              )}
              aria-busy={!onRefresh && loading}
              aria-label={actionLabel}
              disabled={disabled}
              onClick={onAction}
            >
              <UiIcon kind="refresh" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{actionLabel}</TooltipContent>
        </Tooltip>
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Atualizar"
            title="Atualizar"
            aria-busy={loading}
            onClick={onRefresh}
            className={cn(
              'size-9 shrink-0',
              loading && '[&>svg]:motion-safe:animate-spin',
            )}
          >
            <UiIcon kind="refresh" />
          </Button>
        )}
      </div>
    </FilterBar>
  );
}
