import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectSelector } from './ProjectSelector';
import { matchesProject } from './project-search';

const projects = [
  {
    id: 'one',
    label: 'Ação principal',
    searchText: 'Ação principal Entrega API',
  },
  { id: 'all', label: 'Projeto chamado all' },
];
const render = (props: Partial<Parameters<typeof ProjectSelector>[0]> = {}) =>
  renderToStaticMarkup(
    <ProjectSelector
      projects={projects}
      projectId="one"
      onChange={vi.fn()}
      {...props}
    />,
  );
const source = readFileSync(
  new URL('./ProjectSelector.tsx', import.meta.url),
  'utf8',
);

it('uses one design-system Select trigger and arrow, not an external input or clear button', () => {
  const html = render();
  expect(html.match(/data-slot="select-trigger"/g)).toHaveLength(1);
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html.match(/lucide-chevron-down/g)).toHaveLength(1);
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('data-slot="input"');
  expect(html).not.toContain('Limpar projeto');
  expect(source).toContain("from '../../components/ui/select'");
});

it('displays the current selection, all, required placeholder and unavailable selection', () => {
  expect(render()).toContain('Ação principal');
  expect(render({ projectId: '' })).toContain('Todos os projetos');
  const required = render({ projectId: '', allowAll: false });
  expect(required).toContain('Escolha o projeto');
  expect(required).not.toContain('Todos os projetos');
  expect(render({ projectId: 'missing' })).toContain('Projeto não disponível');
  expect(render({ projectId: 'all' })).toContain('Projeto chamado all');
});

it('keeps the label association, disabled state, loading state and error description accessible', () => {
  const html = render({
    disabled: true,
    loading: true,
    error: 'Falha ao carregar',
    label: 'Destino',
  });
  const trigger = html.match(/<button[^>]+>/)?.[0] ?? '';
  const labelId = html.match(/<label[^>]+for="([^"]+)"/)?.[1];
  expect(labelId).toBeTruthy();
  expect(trigger).toContain('id="' + labelId + '"');
  expect(trigger).toContain('disabled=""');
  expect(trigger).toContain('aria-busy="true"');
  expect(trigger).toContain('aria-invalid="true"');
  expect(trigger).toContain('aria-describedby="' + labelId + '-error"');
  expect(html).toContain('role="alert"');
  expect(html).toContain('Falha ao carregar');
  expect(html).toContain('Destino');
});

it('keeps search independent of the selection and resets it only when the menu changes', () => {
  expect(source).toContain(
    "const [searchQuery, setSearchQuery] = useState('')",
  );
  expect(source).toContain('matchesProject(option, searchQuery)');
  expect(source).toContain(
    'onChange={(event) => setSearchQuery(event.target.value)}',
  );
  expect(source).not.toContain('matchesProject(option, selected.label)');
  const openHandler = source
    .split('function changeOpen')[1]
    .split('function choose')[0];
  expect(openHandler).toContain("setSearchQuery('')");
  expect(openHandler).not.toContain('onChange(');
  expect(matchesProject(projects[0], 'acao')).toBe(true);
  expect(matchesProject(projects[0], 'ENTREGA api')).toBe(true);
});

it('keeps filtered item refs stable and excludes hidden options from Radix keyboard navigation', () => {
  expect(source).toContain('{options.map((option) => {');
  expect(source).toContain('disabled={!matches}');
  expect(source).toContain('hidden={!matches}');
  expect(source).not.toContain('{filtered.map(');
  expect(source).toContain(
    'focusSearchOnOpen.current || retainSearchFocus.current',
  );
  expect(source).toContain('focusSearchOnOpen.current = false');
});

it('protects text editing from Radix typeahead, but retains Escape, Tab and arrow navigation', () => {
  const inputHandler = source.split(
    'onChange={(event) => setSearchQuery(event.target.value)}',
  )[1];
  expect(inputHandler).toContain(
    "if (event.key === 'Escape' || event.key === 'Tab') return",
  );
  expect(inputHandler).toContain(
    "if (event.key === 'ArrowDown' || event.key === 'ArrowUp')",
  );
  expect(inputHandler).toContain('event.stopPropagation()');
  expect(inputHandler).toContain('!event.nativeEvent.isComposing');
  expect(source).toContain('onCloseAutoFocus=');
  expect(source).toContain('event.shiftKey ? -1 : 1');
});

it('clears via the all item without conflicting with project IDs or offering clear when required', () => {
  expect(source).toContain(
    "const selectValue = (id: string) => (id ? 'project:' + id : allValue)",
  );
  expect(source).toContain(
    "onChange(value === allValue ? '' : value.slice('project:'.length))",
  );
  expect(source).toContain(
    "? [{ id: '', label: 'Todos os projetos' }, ...projects]",
  );
  expect(source).not.toContain('Limpar projeto');
});
