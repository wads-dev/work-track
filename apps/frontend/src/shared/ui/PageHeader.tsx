import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { layoutTokens } from './layout-tokens';

export function PageHeader({
  title,
  context,
  actions,
  children,
}: {
  title: string;
  context: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title + ' e filtros'}
      className={cn('mb-3', layoutTokens.surface, layoutTokens.stack)}
    >
      <div className={layoutTokens.wrapRow}>
        <div className="min-w-0 flex-1 basis-[200px]">
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        {actions && (
          <div className={cn(layoutTokens.wrapRow, layoutTokens.controls)}>
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
