import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../components/ui/tooltip';
import { CalendarToolbar } from './CalendarToolbar';
function markup(profile = false, loading = false) {
  const noop = vi.fn();
  return renderToStaticMarkup(
    createElement(TooltipProvider, {
      children: createElement(CalendarToolbar, {
        date: '2026-10-08',
        view: 'three-days',
        density: 'timeline',
        allWeeks: false,
        projectId: '',
        projects: [{ id: 'p', label: 'Projeto demo' }],
        projectsLoading: false,
        projectsError: '',
        personId: 'me',
        personOptions: [
          { value: 'me', label: 'Meu calendário', text: 'Meu calendário' },
        ],
        personAvatar: createElement('span', null, 'Avatar'),
        personDisabled: profile,
        subject: '',
        topics: [],
        includeArchived: false,
        onDate: noop,
        onMove: noop,
        onView: noop,
        onDensity: noop,
        onPerson: noop,
        onProject: noop,
        onSubject: noop,
        onArchived: noop,
        onRefresh: noop,
        loading,
      }),
    }),
  );
}
describe('calendar toolbar design-system contract', () => {
  it('indicates refresh progress only on the refresh icon', () => {
    expect(markup(false, true)).toContain('motion-safe:animate-spin');
    expect(markup(false, true)).toContain('aria-busy="true"');
    expect(markup()).not.toContain('animate-spin');
  });
  it('uses one design-system trigger for all four selectors, including projects and avatar', () => {
    const html = markup();
    expect(html.match(/data-slot="select-trigger"/g)).toHaveLength(4);
    expect(html).toContain('Últimos três dias');
    expect(html).toContain('Todos os projetos');
    expect(html).toContain('Avatar');
    expect(html).not.toContain('Pesquisar projetos');
  });
  it('groups date arrows inside the input boundary and places actions in a right-aligned group', () => {
    const html = markup();
    const group = html.split('data-calendar-date')[1].split('</div>')[0];
    expect(group).toContain('Período anterior');
    expect(group).toContain('type="date"');
    expect(group).toContain('Próximo período');
    expect(group).toContain('rounded-none');
    expect(html).toContain('ml-auto shrink-0 justify-end');
    expect(html).toContain('aria-pressed="false"');
  });
  it('keeps person selection available unless explicitly fixed to a profile', () => {
    const html = markup();
    const trigger = html
      .split('aria-label="Pessoa"')[0]
      .split('<button')
      .at(-1)!;
    expect(trigger).not.toContain('disabled=""');
    expect(markup(true)).toContain('disabled=""');
  });
});
