import { TooltipProvider } from '../../components/ui/tooltip';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { RecordsList } from './RecordsList';
import { RecordsToolbar } from './RecordsToolbar';
import { projectColors } from '../../shared/ui/project-colors';
import type { Row } from '../../shared/data';
const catalog: Row[] = [
  {
    id: 'p',
    data: {
      title: 'Privado',
      createdBy: 'alice',
      type: 'work',
      archived: false,
      confidential: true,
      color: '#123abc',
      topics: [{ id: 't', title: 'Tópico secreto', archived: false }],
    },
  },
  {
    id: 'public',
    data: {
      title: 'Público',
      createdBy: 'alice',
      type: 'work',
      archived: false,
      confidential: false,
      topics: [],
    },
  },
];
const row: Row = {
  id: 'r',
  data: {
    projectId: 'p',
    startedAt: '2026-10-11T12:00:00Z',
    endedAt: null,
    topics: [{ topicId: 't' }],
  },
};
const render = (revealed = false, pending = false) =>
  renderToStaticMarkup(
    <TooltipProvider>
      <MemoryRouter>
        <RecordsList
          state={{ rows: [row], loading: false, error: '', retry: () => {} }}
          catalog={catalog}
          revealed={revealed}
          pathname={pending ? '/pending' : '/records'}
          search="?project=p"
          pending={pending}
        />
      </MemoryRouter>
    </TooltipProvider>,
  );
describe('record and pending lists', () => {
  it('uses the same domain palette with complete catalog and masks title topics and explicit color', () => {
    const html = render();
    expect(html).toContain('Projeto reservado');
    expect(html).not.toContain('Tópico secreto');
    expect(html).not.toContain('Privado');
    expect(html).not.toContain('#123abc');
    expect(html).toContain(
      'border-left-color:' + projectColors(catalog, false)('p'),
    );
    const shown = render(true);
    expect(shown).toContain('Privado');
    expect(shown).toContain('Tópico secreto');
    expect(shown).toContain('#123abc');
  });
  it('keeps both date facts and contextual review paths without inventing an end', () => {
    const html = render();
    expect(html).toContain('Fim não informado');
    expect(html).toContain('11/10/2026, 09:00');
    expect(html).toContain('/records?project=p&amp;record=r');
    const pending = render(false, true);
    expect(pending).toContain('Revisar fim');
    expect(pending).toContain('/pending?project=p&amp;record=r');
  });
  it('uses a shared compact header with no timezone or state input and privacy-safe project search', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <RecordsToolbar
          catalog={catalog}
          revealed={false}
          loading={false}
          error=""
          params={new URLSearchParams()}
          search=""
          onFilter={() => {}}
          onProjectsChange={() => {}}
          onClear={() => {}}
        />
      </TooltipProvider>,
    );
    expect(html).toContain('Pesquisar registros…');
    expect(html).toContain('min-w-0 flex-1');
    expect(html).toContain('aria-label="Limpar filtros"');
    expect(html).not.toContain('Privado');
    expect(html).not.toContain('Estado do registro');
    expect(html).not.toContain('Fuso');
  });
  it('puts header before warnings and ignores old status/zone URL filters', () => {
    const source = readFileSync(
      new URL('../dashboard/Dashboard.tsx', import.meta.url),
      'utf8',
    );
    expect(source.indexOf('<RecordsToolbar')).toBeLessThan(
      source.indexOf('<AlertTitle>Registros em aberto'),
    );
    expect(source).toContain("status: 'all'");
    expect(source).toContain("const zone = 'America/Sao_Paulo'");
    expect(source).not.toContain("status: params.get('recordStatus')");
    expect(source).toContain("next.delete('recordStatus')");
    expect(source).toContain("next.delete('timeZone')");
    expect(source).not.toContain('Histórico completo sincronizado.');
    expect(source).not.toContain('function DataTable');
  });
  it('keeps all three features on ListTable without domain-owned table/card branches', () => {
    for (const name of ['../projects/ProjectList.tsx', './RecordsList.tsx']) {
      const src = readFileSync(new URL(name, import.meta.url), 'utf8');
      expect(src).toContain('<ListTable');
      expect(src).not.toContain('<Table>');
      expect(src).not.toContain('<Card');
    }
    const src = readFileSync(
      new URL('../pending/PendingPage.tsx', import.meta.url),
      'utf8',
    );
    expect(src).toContain('<RecordsList');
    expect(src).toContain('openOnly: true');
    expect(src).not.toContain('<Table>');
  });
});
