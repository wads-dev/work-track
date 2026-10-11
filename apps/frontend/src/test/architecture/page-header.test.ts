import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageHeader } from '../../shared/ui/PageHeader';
import { layoutTokens } from '../../shared/ui/layout-tokens';

describe('compact page header design tokens', () => {
  it('shares 12px padding, 8px gaps and responsive touch targets', () => {
    expect(layoutTokens.surface).toContain('p-3');
    expect(layoutTokens.wrapRow).toContain('gap-2');
    expect(layoutTokens.stack).toContain('gap-2');
    expect(layoutTokens.controlHeight).toBe('h-11 sm:h-9');
    expect(layoutTokens.controls).toContain(']:min-h-11');
    expect(layoutTokens.controls).toContain(']:min-h-9');
    expect(layoutTokens.controls).toContain(']:min-w-11');
    expect(layoutTokens.controls).toContain(']:min-w-9');
  });

  it('keeps title, context, actions and child form labels accessible', () => {
    const markup = renderToStaticMarkup(
      createElement(PageHeader, {
        title: 'Projetos',
        context: 'Contexto atual',
        actions: createElement(
          'button',
          { 'aria-label': 'Novo projeto' },
          'Novo',
        ),
        children: createElement('label', null, 'Nome', createElement('input')),
      }),
    );
    expect(markup).toContain('aria-label="Projetos e filtros"');
    for (const token of layoutTokens.surface.split(' '))
      expect(markup).toContain(token);
    expect(markup).toContain(layoutTokens.wrapRow);
    expect(markup).toContain('>Projetos</h1>');
    expect(markup).toContain('>Contexto atual</p>');
    expect(markup).toContain('aria-label="Novo projeto"');
    expect(markup).toContain('<label>Nome<input/></label>');
    expect(markup).not.toContain('sr-only');
    expect(markup).not.toContain('p-5');
    expect(markup).not.toContain('sm:p-6');
  });

  it('renders no empty action slot', () => {
    const markup = renderToStaticMarkup(
      createElement(PageHeader, {
        title: 'Registros',
        context: 'Seus registros',
      }),
    );
    expect(markup).not.toContain('[&_button');
  });
});
