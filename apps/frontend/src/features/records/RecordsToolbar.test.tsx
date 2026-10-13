import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TooltipProvider } from '../../components/ui/tooltip';
import { RecordsToolbar } from './RecordsToolbar';

// Render dropdown contents eagerly so the regression can inspect the options
// passed by the toolbar without relying on Radix portal/layout behavior in SSR.
vi.mock('../../components/ui/select', () => ({
  Select: ({
    children,
    disabled,
    value,
  }: {
    children: ReactNode;
    disabled?: boolean;
    value: string;
  }) => (
    <div data-disabled={disabled} data-value={value}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <span data-option={value}>{children}</span>
  ),
  SelectTrigger: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  SelectValue: () => null,
}));
vi.mock('../projects/ProjectSelector', () => ({
  ProjectSelector: ({
    projects,
  }: {
    projects: { id: string; label: string; searchText: string }[];
  }) => <div data-project-options={JSON.stringify(projects)} />,
}));
const catalog = [
  {
    id: 'other',
    data: {
      title: 'Other project',
      topics: [{ id: 'other-topic', title: 'Other topic' }],
    },
  },
  {
    id: 'selected',
    data: {
      title: 'Selected project',
      topics: [{ id: 'selected-topic', title: 'Selected topic' }],
    },
  },
  {
    id: 'private',
    data: {
      title: 'Secret project',
      description: 'Secret activity',
      confidential: true,
      topics: [{ id: 'secret-topic', title: 'Secret topic' }],
    },
  },
];
const render = (projectId = 'selected', revealed = false) =>
  renderToStaticMarkup(
    <TooltipProvider>
      <RecordsToolbar
        catalog={catalog}
        revealed={revealed}
        loading={false}
        error=""
        params={new URLSearchParams({ project: projectId })}
        search="query"
        onFilter={() => {}}
        onClear={() => {}}
      />
    </TooltipProvider>,
  );

describe('record toolbar metadata presentation', () => {
  it('receives only the selected parent embedded topic options via repository output', () => {
    const html = render();
    expect(html).toContain('Selected topic');
    expect(html).toContain('data-option="selected-topic"');
    expect(html).not.toContain('Other topic');
    expect(html).not.toContain('data-option="other-topic"');
    expect(html).toContain('Todos os tópicos');
    expect(html).toContain('aria-label="Tópico"');
    expect(html).toContain('aria-label="Data inicial"');
    expect(html).toContain('aria-label="Data final"');
    expect(html).toContain('aria-label="Limpar filtros"');
    expect(html).toContain('grid min-w-0 grid-cols-2');
  });

  it('masks private topics and project search content, including a selected secret topic ID', () => {
    const hidden = render('private', false);
    expect(hidden).toContain('Projeto reservado');
    expect(hidden).not.toContain('Secret');
    expect(hidden).not.toContain('secret-topic');
    const shown = render('private', true);
    expect(shown).toContain('Secret project');
    expect(shown).toContain('Secret activity');
    expect(shown).toContain('Secret topic');
    expect(shown).toContain('data-option="secret-topic"');
  });

  it('returns no topic options for missing/removed parents and disables the unselected control', () => {
    const missing = render('missing', true);
    expect(missing).not.toContain('data-option="selected-topic"');
    expect(missing).not.toContain('data-option="other-topic"');
    expect(missing).not.toContain('data-option="secret-topic"');
    expect(render('')).toContain('data-disabled="true"');
  });
});
