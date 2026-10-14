import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ProjectAppearance } from '@work-track/core/registration/domain/project-color';
import { type Row } from '../../shared/data';
import { safeProject } from '../../shared/ui/privacy';
import { ProjectList } from './ProjectList';

const catalog: Row[] = [
  {
    id: 'z',
    data: {
      title: 'Zebra',
      createdBy: 'alice',
      type: 'work',
      archived: false,
      confidential: false,
      description: 'Long description must stay in details',
      color: '#ff8800',
      createdAt: '2026-10-09T12:00:00Z',
      topics: [
        { id: 't1', title: 'Geral', archived: false },
        { id: 't2', title: 'Infraestrutura', archived: false },
      ],
    },
  },
  {
    id: 'a',
    data: {
      title: 'Árvore',
      createdBy: 'alice',
      type: 'work',
      archived: false,
      confidential: false,
      topics: [],
    },
  },
];
function render(rows = catalog, revealed = false, state = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/projects?scope=work']}>
      <ProjectList
        catalog={rows}
        revealed={revealed}
        state={{
          rows: rows.map((row) => ({
            ...row,
            data: safeProject(row.data, revealed),
          })),
          loading: false,
          error: '',
          retry: () => {},
          ...state,
        }}
      />
    </MemoryRouter>,
  );
}
describe('compact project list', () => {
  it('renders alphabetically in two rows per project with full-width wrapped topics and no descriptions', () => {
    const html = render();
    expect(html.indexOf('Árvore')).toBeLessThan(html.indexOf('Zebra'));
    expect(html.match(/<tbody/g)).toHaveLength(2);
    expect(html.match(/colSpan="2"/g)).toHaveLength(2);
    expect(html).toContain('flex-wrap');
    expect(html).toContain('Criado em');
    expect(html).toContain('09/10/2026');
    expect(html).not.toContain('Long description');
    expect(html).not.toContain('Descrição');
    expect(html.match(/border-left-color:#ff8800/g)).toHaveLength(2);
    expect(html).toContain('/projects/z?returnTo=');
    expect(html).toContain('/projects/z/topics/t2?returnTo=');
  });
  it('uses the calendar domain color policy for projects without explicit colors', () => {
    const colors = catalog.map((row) => ({
      id: row.id,
      color: row.data.color,
    }));
    const expected = new ProjectAppearance(colors[1]!).getColor(colors);
    expect(render()).toContain('border-left-color:' + expected);
  });
  it('retains every topic, including long labels, without truncating the collection', () => {
    const topics = Array.from({ length: 24 }, (_, i) => ({
      id: 'topic-' + i,
      title: 'Tópico extenso de infraestrutura ' + i,
      archived: false,
    }));
    const html = render([
      {
        id: 'many',
        data: {
          title: 'Muitos tópicos',
          createdBy: 'alice',
          type: 'work',
          archived: false,
          confidential: false,
          topics,
        },
      },
    ]);
    expect(html.match(/data-slot="badge"/g)).toHaveLength(24);
    expect(html).toContain('Tópico extenso de infraestrutura 23');
    expect(html).toContain('[overflow-wrap:anywhere]');
  });
  it('keeps automatic colors stable when a filter removes other visible projects', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ProjectList
          catalog={catalog}
          revealed={false}
          state={{
            rows: [catalog[1]!],
            loading: false,
            error: '',
            retry: () => {},
          }}
        />
      </MemoryRouter>,
    );
    const colors = catalog.map((row) => ({
      id: row.id,
      color: row.data.color,
    }));
    const expected = new ProjectAppearance(colors[1]!).getColor(colors);
    expect(html).toContain('border-left-color:' + expected);
  });
  it('keeps confidential names topics dates colors and links hidden', () => {
    const html = render([
      {
        id: 'secret',
        data: {
          title: 'Secret title',
          createdBy: 'alice',
          type: 'work',
          archived: false,
          description: 'Secret description',
          confidential: true,
          color: '#abcdef',
          createdAt: '2026-10-09T12:00:00Z',
          topics: [
            { id: 'secret-topic', title: 'Secret topic', archived: false },
          ],
        },
      },
    ]);
    expect(html).toContain('Projeto reservado');
    expect(html).toContain('Tópicos reservados');
    expect(html).not.toContain('Secret');
    expect(html).not.toContain('#abcdef');
    expect(html).not.toContain('09/10/2026');
    expect(html).not.toContain('<a ');
  });
  it('reveals metadata only when requested', () => {
    expect(
      render(
        [
          {
            id: 'secret',
            data: {
              title: 'Secret title',
              createdBy: 'alice',
              type: 'work',
              archived: false,
              confidential: true,
              topics: [{ id: 't', title: 'Secret topic', archived: false }],
            },
          },
        ],
        true,
      ),
    ).toContain('Secret topic');
  });
  it('retains rows during loading but hides them on access errors', () => {
    expect(render(catalog, false, { loading: true })).toContain('Zebra');
    expect(render(catalog, false, { loading: true })).not.toContain(
      'Carregando projetos',
    );
    expect(render(catalog, false, { error: 'Falha de acesso' })).toContain(
      'Tentar novamente',
    );
    expect(render(catalog, false, { error: 'Falha de acesso' })).not.toContain(
      'Zebra',
    );
    expect(render([])).toContain('Nenhum dado disponível');
  });
});
