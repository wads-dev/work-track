import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FilterBar } from './FilterBar';

it('uses a semantic wrapping row without a card, background, border or external padding', () => {
  const html = renderToStaticMarkup(
    <FilterBar label="Filtros" data-query-compact>
      <button>Selecionar</button>
    </FilterBar>,
  );
  expect(html).toContain('aria-label="Filtros"');
  expect(html).toContain('flex-wrap');
  expect(html).toContain('data-query-compact');
  for (const decoration of ['bg-card', 'border', 'rounded', 'p-3'])
    expect(html).not.toContain(decoration);
});
it('projects and query headers share the same undecorated component without an opt-in card variant', () => {
  for (const path of ['./CompactListToolbar.tsx', './QueryToolbar.tsx']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(source).toContain('<FilterBar');
  }
  const query = readFileSync(
    new URL('./QueryToolbar.tsx', import.meta.url),
    'utf8',
  );
  expect(query).not.toContain('layoutTokens.surface');
  expect(query).not.toContain('bg-card');
});
