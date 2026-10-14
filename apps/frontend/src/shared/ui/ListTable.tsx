import type { ReactNode } from 'react';
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

export type ListColumn<T> = {
  key: string;
  label: string;
  className?: string;
  cell: (row: T) => ReactNode;
};
/** One list-table design: domain callers provide content, not table/card markup. */
export function ListTable<T>({
  label,
  caption = label,
  rows,
  rowKey,
  columns,
  rowColor,
  detail,
  loading = false,
  error = '',
  retry,
  empty = 'Nenhum resultado encontrado.',
  mobile = 'stack',
  hideHeading = true,
}: {
  label: string;
  caption?: string;
  rows: T[];
  rowKey: (row: T) => string;
  columns: ListColumn<T>[];
  rowColor?: (row: T) => string | undefined;
  detail?: (row: T) => ReactNode;
  loading?: boolean;
  error?: string;
  retry?: () => void;
  empty?: ReactNode;
  mobile?: 'stack' | 'table';
  hideHeading?: boolean;
}) {
  const colorStyle = (row: T) =>
    rowColor ? { borderLeftColor: rowColor(row) } : undefined;
  return (
    <section aria-label={label} className="min-w-0">
      {!hideHeading && <h2 className="mb-4 text-2xl font-semibold">{label}</h2>}
      {loading && rows.length === 0 ? null : error ? (
        <Alert variant="destructive">
          <AlertTitle>
            Não foi possível carregar {label.toLocaleLowerCase('pt-BR')}
          </AlertTitle>
          <AlertDescription>
            {error}
            {retry && (
              <Button variant="outline" size="sm" onClick={retry}>
                Tentar novamente
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <Alert>
          <AlertDescription>{empty}</AlertDescription>
        </Alert>
      ) : (
        <>
          {mobile === 'stack' && (
            <div className="grid gap-3 sm:hidden" data-list-mobile>
              {rows.map((row) => (
                <article
                  key={rowKey(row)}
                  className={cn(
                    'min-w-0 rounded-xl border bg-card p-4',
                    rowColor && 'border-l-4',
                  )}
                  style={colorStyle(row)}
                >
                  <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                    {columns.map((column, i) => (
                      <div
                        key={column.key}
                        className={cn(
                          'min-w-0 [overflow-wrap:anywhere]',
                          i < columns.length - 1 && 'col-span-2',
                        )}
                      >
                        <dt className="mb-1 text-xs text-muted-foreground">
                          {column.label}
                        </dt>
                        <dd className="text-sm">{column.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                  {detail && <div className="mt-2">{detail(row)}</div>}
                </article>
              ))}
            </div>
          )}
          <div
            data-list-table
            tabIndex={0}
            aria-label={label + ' — tabela'}
            className={cn(
              'min-w-0 overflow-hidden rounded-xl border bg-card',
              mobile === 'stack' && 'hidden sm:block',
            )}
          >
            <Table className="table-fixed">
              <caption className="sr-only">{caption}</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      scope="col"
                      className={cn('px-4', column.className)}
                    >
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              {rows.map((row) => (
                <tbody
                  key={rowKey(row)}
                  className="border-b last:border-b-0 hover:bg-muted/50"
                >
                  <TableRow className="border-0 hover:bg-transparent">
                    {columns.map((column, i) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          'px-4 py-3 align-top whitespace-normal [overflow-wrap:anywhere]',
                          detail && 'pb-1',
                          i === 0 && rowColor && 'border-l-4',
                          column.className,
                        )}
                        style={i === 0 ? colorStyle(row) : undefined}
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                  {detail && (
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableCell
                        colSpan={columns.length}
                        className={cn(
                          'px-4 pt-1 pb-3 whitespace-normal',
                          rowColor && 'border-l-4',
                        )}
                        style={colorStyle(row)}
                      >
                        {detail(row)}
                      </TableCell>
                    </TableRow>
                  )}
                </tbody>
              ))}
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
