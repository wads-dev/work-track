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
      navigation: (_, compact) =>
        createElement(
          'nav',
          { id: 'menu-principal', 'data-compact': compact },
          createElement(
            'a',
            { href: '/calendar', 'aria-label': 'Calendário' },
            'Calendário',
          ),
        ),
      header: createElement('h1', null, 'Título'),
      children: 'Conteúdo',
    }),
  );
}
describe('collapsible navigation at every viewport', () => {
  it('keeps desktop navigation mounted and animates matching expanded/compact insets', () => {
    const open = markup(true, true);
    expect(open).toContain('<aside');
    expect(open.match(/lg:ml-64/g)).toHaveLength(2);
    expect(open).toContain('aria-label="Recolher menu de navegação"');
    expect(open).toContain('aria-expanded="true"');
    expect(open).not.toContain('lg:hidden');
    const closed = markup(true, false);
    expect(closed).toContain('<aside');
    expect(closed).toContain('w-20');
    expect(closed.match(/lg:ml-20/g)).toHaveLength(2);
    expect(closed).not.toContain('lg:ml-64');
    expect(closed).toContain('<nav');
    expect(closed).toContain('data-compact="true"');
    expect(closed).toContain('href="/calendar"');
    expect(closed).toContain('aria-label="Calendário"');
    for (const html of [open, closed]) {
      expect(html).toContain('transition-[width]');
      expect(html.match(/transition-\[margin-left\]/g)).toHaveLength(2);
      expect(html.match(/motion-reduce:transition-none/g)).toHaveLength(3);
    }
    expect(open).toContain('data-compact="false"');
    expect(closed).toContain('aria-label="Abrir menu de navegação"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('id="conteudo"');
  });
  it('uses a mobile dialog trigger without reserving desktop sidebar space', () => {
    const mobile = markup(false, false);
    expect(mobile).not.toContain('<aside');
    expect(mobile).not.toContain('lg:ml-64');
    expect(mobile).not.toContain('lg:ml-20');
    expect(mobile).not.toContain('<nav');
    expect(mobile).toContain('aria-haspopup="dialog"');
    expect(mobile).toContain('aria-label="Abrir menu de navegação"');
  });
});
