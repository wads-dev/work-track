import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MultiSelect, multiSelectionLabel } from './MultiSelect';
import {
  CalendarMultiSelect,
  calendarSelectionLabel,
} from '../../features/reports/CalendarMultiSelect';
import {
  projectMultiSelectOptions,
  searchOptions,
} from '../../data/repositories/option-search-repository';

it('preserves old imports as aliases, not another implementation', () => {
  expect(CalendarMultiSelect).toBe(MultiSelect);
  expect(calendarSelectionLabel).toBe(multiSelectionLabel);
});
it('searches display-safe labels accent-insensitively without hidden project metadata', () => {
  const projects = [
    { id: 'a', label: 'Projeto reservado', searchText: 'Segredo' },
    { id: 'b', label: 'Ação' },
  ];
  expect(
    searchOptions(projectMultiSelectOptions(projects, false), 'segredo'),
  ).toEqual([]);
  expect(
    searchOptions(projectMultiSelectOptions(projects, true), 'segredo').map(
      (o) => o.value,
    ),
  ).toEqual(['a']);
  expect(
    searchOptions(projectMultiSelectOptions(projects, false), 'ACAO').map(
      (o) => o.value,
    ),
  ).toEqual(['b']);
});
it('bounds selection additions but leaves selected checkboxes removable at the limit', () => {
  const values = Array.from({ length: 100 }, (_, i) => 'id' + i);
  const html = renderToStaticMarkup(
    <MultiSelect
      label="Itens"
      values={values}
      options={[
        { value: 'id0', text: 'Selecionado', label: 'Selecionado' },
        { value: 'extra', text: 'Extra', label: 'Extra' },
      ]}
      allLabel="Todos"
      plural="itens selecionados"
      onChange={vi.fn()}
    />,
  );
  expect(html.match(/disabled=""/g)).toHaveLength(1);
  expect(html.match(/checked=""/g)).toHaveLength(1);
  expect(multiSelectionLabel([], ['missing'], 'Todos', 'itens')).toBe(
    'Seleção indisponível',
  );
});
