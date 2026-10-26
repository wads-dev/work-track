import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CalendarMultiSelect,
  calendarSelectionLabel,
} from './CalendarMultiSelect';
import {
  calendarPerson,
  calendarRequest,
  updateCalendarPeople,
} from './calendar-people';
import {
  calendarProjects,
  updateCalendarProjects,
} from './calendar-project-filter';
const options = [
  { value: 'a', text: 'Atlas', label: 'Atlas' },
  { value: 'b', text: 'Atlas', label: 'Atlas' },
];
const request = (query: string) =>
  calendarRequest(new URLSearchParams(query), 'me', 'from', 'to', 'UTC', false);
describe('calendar multiselect URL and scope', () => {
  it('canonicalizes arrays and preserves legacy links', () => {
    expect(
      calendarProjects(
        new URLSearchParams('projectIds=z&projectIds=a&projectIds=z'),
      ),
    ).toEqual(['a', 'z']);
    expect(calendarProjects(new URLSearchParams('projectId=legacy'))).toEqual([
      'legacy',
    ]);
    expect(
      calendarPerson(new URLSearchParams('uid=other'), 'me').userIds,
    ).toEqual(['other']);
    expect(
      request('projectIds=z&projectIds=a&userIds=z&userIds=me&userIds=z'),
    ).toMatchObject({
      projectIds: ['a', 'z'],
      userIds: ['me', 'z'],
      mode: 'global',
    });
  });
  it('defaults to self, but all people is explicit and multiple always global', () => {
    expect(calendarPerson(new URLSearchParams(), 'me').mode).toBe('own');
    expect(calendarPerson(new URLSearchParams('userIds=me'), 'me').mode).toBe(
      'own',
    );
    const all = updateCalendarPeople(new URLSearchParams('uid=me'), []);
    expect(all.get('uid')).toBe('all');
    expect(request(all.toString()).mode).toBe('global');
    expect(request(all.toString()).userIds).toBeUndefined();
    expect(
      calendarPerson(new URLSearchParams('userIds=me&userIds=other'), 'me')
        .showPeople,
    ).toBe(true);
  });
  it('clears topic and history on non-single project changes, preserves unrelated filters', () => {
    const original = new URLSearchParams(
      'projectId=a&uid=other&subject=t&allWeeks=true&record=r&includeArchived=true',
    );
    const multiple = updateCalendarProjects(original, ['b', 'a', 'a']);
    expect(multiple.getAll('projectIds')).toEqual(['a', 'b']);
    for (const key of ['projectId', 'subject', 'allWeeks', 'record'])
      expect(multiple.has(key)).toBe(false);
    expect(multiple.get('uid')).toBe('other');
    expect(multiple.get('includeArchived')).toBe('true');
    expect(updateCalendarProjects(original, ['b']).get('allWeeks')).toBe(
      'true',
    );
    expect(calendarProjects(updateCalendarProjects(original, []))).toEqual([]);
    expect(original.get('subject')).toBe('t');
  });
  it('rejects oversized URL selections rather than truncating reports', () => {
    for (const key of ['userIds', 'projectIds']) {
      const params = new URLSearchParams();
      for (let i = 0; i < 101; i++) params.append(key, 'id' + i);
      expect(() => request(params.toString())).toThrow('100');
    }
  });
  it('rejects ambiguous and non-single topic/history URLs', () => {
    for (const query of [
      'projectId=a&projectIds=b',
      'uid=me&userIds=other',
      'projectIds=a&projectIds=b&subject=t',
      'projectIds=a&projectIds=b&allWeeks=true',
    ])
      expect(() => request(query)).toThrow();
  });
});
describe('shared checkbox picker compatibility', () => {
  it('shows readable selection labels and explicit all/clear semantics', () => {
    expect(
      calendarSelectionLabel(
        options,
        [],
        'Todos os projetos',
        'projetos selecionados',
      ),
    ).toBe('Todos os projetos');
    expect(
      calendarSelectionLabel(options, ['a'], 'Todos', 'projetos selecionados'),
    ).toBe('Atlas');
    expect(
      calendarSelectionLabel(
        options,
        ['a', 'b'],
        'Todos',
        'projetos selecionados',
      ),
    ).toBe('2 projetos selecionados');
    const html = renderToStaticMarkup(
      createElement(CalendarMultiSelect, {
        label: 'Projetos',
        values: ['a', 'b'],
        options,
        allLabel: 'Todos os projetos',
        plural: 'projetos selecionados',
        onChange: () => {},
      }),
    );
    expect(html).toContain('Pesquisar projetos');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain('Todos os projetos (limpar seleção)');
  });
  it('fixes profile selection without editable controls', () => {
    const html = renderToStaticMarkup(
      createElement(CalendarMultiSelect, {
        label: 'Pessoas',
        values: ['a'],
        options,
        allLabel: 'Todas as pessoas',
        plural: 'pessoas selecionadas',
        disabled: true,
        onChange: () => {},
      }),
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('type="checkbox"');
  });
});
