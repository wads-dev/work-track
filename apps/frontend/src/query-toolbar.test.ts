import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const source = (name: string) =>
  readFileSync(new URL('./' + name, import.meta.url), 'utf8');
describe('shared query toolbar', () => {
  it('resets records page on account/privacy/query/filter changes and does not truncate the query', () => {
    const dashboard = source('Dashboard.tsx');
    expect(dashboard).toContain(
      'JSON.stringify([uid, revealed, filter, params.toString()])',
    );
    expect(dashboard).toContain(
      'pageState.key === pageKey ? pageState.page : 0',
    );
    expect(dashboard).toContain(
      'recordPage(matchingSafeRecords, page, pageSize)',
    );
    const hook = source('useOwnRecords.ts');
    expect(hook).toContain('includeMetadataChanges: true');
    expect(hook).not.toContain('limit(');
    expect(hook).not.toContain('httpsCallable');
  });
  it('shares the responsive labeled surface across calendar, reports and records', () => {
    for (const name of [
      'PersonalPage.tsx',
      'ReportToolbar.tsx',
      'Dashboard.tsx',
    ])
      expect(source(name)).toContain('<QueryToolbar');
    const toolbar = source('QueryToolbar.tsx');
    expect(toolbar).toContain('aria-label={label}');
    expect(toolbar).toContain("flexWrap: 'wrap'");
    expect(toolbar).toContain('{actions}');
  });
  it('does not impose calendar domain controls or navigation on other routes', () => {
    const toolbar = source('QueryToolbar.tsx');
    for (const term of ['density', 'view=', 'Tabs'])
      expect(toolbar).not.toContain(term);
  });
});
describe('shared filter structure', () => {
  it('owns main/secondary/action slots and field sizing, records have no independent grid', () => {
    const toolbar = source('QueryToolbar.tsx');
    for (const slot of [
      'data-query-row="primary"',
      'data-query-row="secondary"',
      'data-query-slot="summary"',
      'data-query-slot="controls"',
      'data-query-slot="actions"',
    ])
      expect(toolbar).toContain(slot);
    expect(toolbar).toContain("kind === 'date' ? 'calc(50% - 6px)' : '100%'");
    expect(toolbar).toContain('xs: 44, sm: 40');
    const records = source('Dashboard.tsx')
      .split('<QueryToolbar')[1]
      .split('</QueryToolbar>')[0];
    expect(records).not.toContain('gridTemplateColumns');
    expect(records).not.toContain('fullWidth');
    expect(records).toContain('secondary=');
    for (const page of ['Dashboard.tsx', 'ReportToolbar.tsx'])
      expect(source(page)).toContain('<QueryPeriodControls');
    expect(source('PersonalPage.tsx')).toContain('<QueryToolbarField');
  });
  it('constructs identical date controls for records and reports with small size and same labels', () => {
    const toolbar = source('QueryToolbar.tsx');
    expect(toolbar).toContain('export function QueryPeriodControls');
    expect(toolbar).toContain('label="Inicial"');
    expect(toolbar).toContain('label="Final"');
    expect(toolbar.match(/kind="date"/g)).toHaveLength(2);
  });
});
describe('mobile toolbar regression', () => {
  it('gives summary and controls their own rows and moves actions after secondary filters', () => {
    const toolbar = source('QueryToolbar.tsx');
    expect(toolbar).toContain("flexBasis: { xs: '100%', sm: 'auto' }");
    expect(toolbar).toContain("flex: { xs: '1 0 100%', sm: 1 }");
    expect(toolbar).toContain('order: { xs: 3, sm: 0 }');
    expect(toolbar).toContain('order: { xs: 2, sm: 1 }');
  });
});
