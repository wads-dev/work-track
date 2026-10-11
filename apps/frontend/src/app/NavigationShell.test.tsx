import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NavigationShell } from './NavigationShell';
function markup(desktop: boolean, open: boolean) {
  return renderToStaticMarkup(
    createElement(NavigationShell, {
      desktop,
      open,
      setOpen: vi.fn(),
      navigation: () =>
        createElement('nav', { id: 'menu-principal' }, 'Calendário'),
      header: createElement('h1', null, 'Título'),
      children: 'Conteúdo',
    }),
  );
}
describe('collapsible navigation at every viewport', () => {
  it('exposes desktop collapse and offsets header and content only while open', () => {
    const open = markup(true, true);
    expect(open).toContain('<aside');
    expect(open.match(/lg:ml-64/g)).toHaveLength(2);
    expect(open).toContain('aria-label="Recolher menu de navegação"');
    expect(open).toContain('aria-expanded="true"');
    expect(open).not.toContain('lg:hidden');
    const closed = markup(true, false);
    expect(closed).not.toContain('<aside');
    expect(closed).not.toContain('lg:ml-64');
    expect(closed).not.toContain('<nav');
    expect(closed).toContain('aria-label="Abrir menu de navegação"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('id="conteudo"');
  });
  it('uses a mobile dialog trigger without reserving desktop sidebar space', () => {
    const mobile = markup(false, false);
    expect(mobile).not.toContain('<aside');
    expect(mobile).not.toContain('lg:ml-64');
    expect(mobile).toContain('aria-haspopup="dialog"');
    expect(mobile).toContain('aria-label="Abrir menu de navegação"');
  });
});
