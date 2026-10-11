import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { layoutTokens } from './layout-tokens';

/** Shared filter header: layout only, never an enclosing card or background. */
export function FilterBar({
  label,
  className,
  children,
  ...props
}: Omit<ComponentProps<'section'>, 'aria-label'> & { label: string }) {
  return (
    <section
      {...props}
      aria-label={label}
      className={cn(layoutTokens.wrapRow, className)}
    >
      {children}
    </section>
  );
}
