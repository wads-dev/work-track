import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { ProjectHeader } from './ProjectHeader';
import { projectColors } from '../../shared/ui/project-colors';
import type { Row } from '../../shared/data';

const project = {
  title: 'Laboratório Horizonte',
  description: 'Descrição demonstrativa.',
  type: 'work',
  color: '#f97316',
};
function render(
  data: Record<string, unknown> | null = project,
  revealed = false,
  search = '?returnTo=%2Fcalendar%3Fview%3Dweek',
  loading = false,
  catalog: Row[] = data ? [{ id: 'demo', data }] : [],
) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ProjectHeader
        projectId="demo"
        project={data ?? undefined}
        catalog={catalog}
        revealed={revealed}
        loading={loading}
        search={search}
        actions={<button aria-label="Atualizar relatório" />}
      >
        <div role="tablist">Visão geral · Detalhes / Editar</div>
      </ProjectHeader>
    </MemoryRouter>,
  );
}
describe('project detail header', () => {
  it('places compact tabs and actions before the project identity, with project color', () => {
    const html = render();
    expect(html.indexOf('role="tablist"')).toBeLessThan(html.indexOf('<h2'));
    expect(html).toContain('border-left-color:#f97316');
    expect(html).toContain('Compartilhado');
    expect(html).toContain('Descrição demonstrativa.');
    expect(html).toContain('justify-between');
    expect(html.indexOf('role="tablist"')).toBeLessThan(
      html.indexOf('>Voltar'),
    );
    expect(html.indexOf('>Voltar')).toBeLessThan(
      html.indexOf('aria-label="Atualizar relatório"'),
    );
    expect(html).toContain('[overflow-wrap:anywhere]');
  });
  it('uses the repository color join with the complete catalog independent of catalog ordering', () => {
    const data = { ...project, color: undefined };
    const catalog = [
      { id: 'other', data: { color: '#f97316' } },
      { id: 'demo', data },
      { id: 'hidden', data: { confidential: true, color: '#123abc' } },
    ];
    const html = render(data, false, '', false, catalog);
    expect(html).toContain(
      'border-left-color:' + projectColors(catalog, false)('demo'),
    );
    expect(render(data, false, '', false, [...catalog].reverse())).toBe(html);
    expect(html).not.toContain('#123abc');
  });
  it('preserves project-list and contextual return routes', () => {
    const html = render();
    expect(html).toContain('href="/calendar?view=week"');
    expect(html.split('Voltar</a>').length - 1).toBe(1);
    expect(render(project, false, '')).toContain('href="/projects"');
  });
  it('rejects external return routes', () => {
    expect(
      render(project, false, '?returnTo=https%3A%2F%2Fevil.test'),
    ).toContain('href="/app"');
  });
  it('masks confidential title description scope and configured color until revealed', () => {
    const data = { ...project, confidential: true };
    const html = render(data);
    expect(html).toContain('Projeto reservado');
    expect(html).not.toContain('Laboratório Horizonte');
    expect(html).not.toContain('Descrição demonstrativa.');
    expect(html).not.toContain('Compartilhado');
    expect(html).not.toContain('#f97316');
    expect(render(data, true)).toContain('Laboratório Horizonte');
  });
  it('identifies personal and archived projects without adding editing controls', () => {
    const html = render({ ...project, type: 'personal', archived: true });
    expect(html).toContain('Pessoal');
    expect(html).toContain('Arquivado');
    expect(html).not.toContain('combobox');
  });
  it('distinguishes loading from unavailable projects', () => {
    expect(render(null, false, '', true)).toContain('Carregando projeto');
    expect(render(null, false, '', false)).toContain('Projeto indisponível');
  });
});
describe('detail layout boundaries', () => {
  const source = (file: string) =>
    readFileSync(new URL(file, import.meta.url), 'utf8');
  it('keeps access and presentation exclusively inside the edit panel', () => {
    const dashboard = source('../dashboard/Dashboard.tsx');
    const access = dashboard.indexOf('<ProjectAccess');
    expect(access).toBeGreaterThan(
      dashboard.indexOf('id="project-panel-details"'),
    );
    expect(access).toBeLessThan(
      dashboard.indexOf('id="project-panel-overview"'),
    );
    expect(
      dashboard.slice(
        dashboard.indexOf('<ProjectHeader'),
        dashboard.indexOf('</ProjectHeader>'),
      ),
    ).not.toContain('<ProjectAccess');
  });
  it('refreshes the report from the header without recreating the report key or adding footer actions', () => {
    const dashboard = source('../dashboard/Dashboard.tsx');
    const report = source('../reports/ProjectReport.tsx');
    expect(dashboard).toContain('aria-label="Atualizar relatório"');
    expect(dashboard).toContain('refreshKey={reportRefresh}');
    expect(report).toContain('    refreshKey,');
    expect(report).not.toContain('Atualizar relatório');
  });
  it('keeps archive in header actions with a protected dialog instead of the edit body', () => {
    const dashboard = source('../dashboard/Dashboard.tsx');
    const editor = source('./ProjectEditor.tsx');
    const archive = source('./ProjectArchive.tsx');
    expect(
      dashboard.slice(
        dashboard.indexOf('actions={'),
        dashboard.indexOf('</ProjectHeader>'),
      ),
    ).toContain('<ProjectArchive');
    expect(editor).not.toContain('<ProjectArchive');
    expect(archive).toContain('<Dialog');
    expect(archive).toContain('busyRef.current');
    expect(archive).toContain('!confirmed');
  });
  it('collapses explanatory text while leaving partial and provisional alerts visible', () => {
    const report = source('../reports/ProjectReport.tsx');
    const start = report.indexOf('<details');
    const end = report.indexOf('</details>', start);
    expect(report.indexOf('Pode somar atividades simultâneas')).toBeGreaterThan(
      start,
    );
    expect(report.indexOf('Estimativas não alteram fatos')).toBeLessThan(end);
    expect(report.indexOf('Sobre o cálculo')).toBeGreaterThan(
      report.indexOf('<TopicReport'),
    );
    expect(report.indexOf('Sobre o cálculo')).toBeLessThan(
      report.indexOf('Registros resumidos do projeto'),
    );
    expect(report).toContain('createPortal');
    expect(report).toContain('report.page.partial');
    expect(report).toContain('Dados locais provisórios');
    expect(report).not.toContain(
      'Registros selecionados — sem texto privado ou contexto',
    );
    expect(report).toContain(
      '<caption className="sr-only">Registros do projeto</caption>',
    );
  });
});
