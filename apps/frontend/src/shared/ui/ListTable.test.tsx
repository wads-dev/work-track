import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListTable } from './ListTable';
const rows = [{ id: '1', name: 'Projeto longo' }];
const props = {
  label: 'Lista',
  rows,
  rowKey: (r: (typeof rows)[number]) => r.id,
  columns: [
    { key: 'name', label: 'Nome', cell: (r: (typeof rows)[number]) => r.name },
  ],
};
describe('shared list table design', () => {
  it('owns table semantics responsive cards full width details and row accents', () => {
    const html = renderToStaticMarkup(
      <ListTable
        {...props}
        rowColor={() => '#f97316'}
        detail={() => 'Tópicos'}
      />,
    );
    expect(html).toContain('scope="col"');
    expect(html).toContain('sr-only');
    expect(html).toContain('data-list-mobile');
    expect(html).toContain('data-list-table');
    expect(html.match(/<tbody/g)).toHaveLength(1);
    expect(html).toContain('colSpan="1"');
    expect(html.match(/border-left-color:#f97316/g)).toHaveLength(3);
  });
  it('does not claim empty results when loading or erroring and supports retry', () => {
    expect(
      renderToStaticMarkup(<ListTable {...props} rows={[]} loading />),
    ).toContain('Carregando');
    const html = renderToStaticMarkup(
      <ListTable {...props} error="Falha segura" retry={() => {}} />,
    );
    expect(html).toContain('Falha segura');
    expect(html).toContain('Tentar novamente');
    expect(html).not.toContain('<table');
  });
  it('keeps compact project rows as a single table at every width', () => {
    const html = renderToStaticMarkup(<ListTable {...props} mobile="table" />);
    expect(html).not.toContain('data-list-mobile');
    expect(html).not.toContain('sm:block');
  });
});
