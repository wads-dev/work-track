import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ReportToolbar } from './ReportToolbar';
function render(includeArchived?: boolean, loading = false) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ReportToolbar
        total="2 h"
        loading={loading}
        fromDate=""
        toDate=""
        projectId=""
        projects={[]}
        onFilter={() => {}}
        onRefresh={() => {}}
        onInfo={() => {}}
        includeArchived={includeArchived}
      />
    </TooltipProvider>,
  );
}
describe('report archive icon', () => {
  it('keeps the previous total and indicates loading only in the refresh button', () => {
    const html = render(false, true);
    expect(html).toContain('2 h');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('motion-safe:animate-spin');
    expect(html).not.toContain('data-slot="skeleton"');
  });
  it.each([false, true])(
    'uses the calendar icon toggle and reflects pressed=%s',
    (value) => {
      const html = render(value);
      expect(html).toContain('aria-label="Incluir arquivados"');
      expect(html).toContain('aria-pressed="' + value + '"');
      expect(html).toContain('data-size="icon"');
      expect(html).not.toContain('role="checkbox"');
      expect(html).not.toContain('>Arquivados</');
    },
  );
  it('does not show archive toggle for callers without that filter', () => {
    expect(render()).not.toContain('aria-label="Incluir arquivados"');
  });
});
