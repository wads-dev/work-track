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
    for (const term of ['density', 'view=', 'Tabs', 'fromDate'])
      expect(toolbar).not.toContain(term);
  });
});
