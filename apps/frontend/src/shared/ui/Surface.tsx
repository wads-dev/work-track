import { Card } from '../../components/ui/card';
import type { ReactNode } from 'react';
export function Surface({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
      {children}
    </Card>
  );
}
export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="py-10 text-center text-muted-foreground">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {detail && <p className="mt-2 text-sm">{detail}</p>}
    </div>
  );
}
