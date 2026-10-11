import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { TooltipProvider } from '../../components/ui/tooltip';
import { CompactListToolbar } from './CompactListToolbar';

it('shares the compact list toolbar between Projects and People instead of duplicating markup', () => {
  for (const path of [
    '../../features/dashboard/Dashboard.tsx',
    '../../features/people/PeoplePage.tsx',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(source).toContain('<CompactListToolbar');
    expect(source).not.toContain('lg:flex-row lg:items-center');
  }
});

it('keeps optional filters, search and icon action in the responsive list controls', () => {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <CompactListToolbar
        label="Filtros"
        leading={<span>Escopo</span>}
        filters={<span>Estado</span>}
        searchLabel="Pesquisar"
        searchPlaceholder="Pesquisar…"
        search="Ana"
        onSearchChange={() => {}}
        actionLabel="Atualizar"
        onAction={() => {}}
      />
    </TooltipProvider>,
  );
  expect(html).toContain('lg:flex-row lg:items-center');
  expect(html).toContain('min-w-0 flex-1');
  expect(html).toContain('size-9 shrink-0');
  expect(html).toContain('aria-label="Pesquisar"');
  expect(html).toContain('value="Ana"');
  expect(html).toContain('aria-label="Atualizar"');
  expect(html).toContain('aria-hidden="true"');
  expect(html.indexOf('Escopo')).toBeLessThan(html.indexOf('Estado'));
  expect(html.indexOf('Estado')).toBeLessThan(html.indexOf('<input'));
});
