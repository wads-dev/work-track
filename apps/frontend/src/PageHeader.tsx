import type { ReactNode } from 'react';
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
      className="mb-4 rounded-xl border bg-card p-5 sm:p-6"
    >
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h1 className="text-[22px] font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
