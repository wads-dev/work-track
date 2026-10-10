import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const source = (name: string) =>
  readFileSync(new URL('./' + name, import.meta.url), 'utf8');
describe('shared query toolbar', () => {
  it('resets records page on account/privacy/query/filter changes and does not truncate the query', () => {
    const dashboard = source('../../features/dashboard/Dashboard.tsx');
    expect(dashboard).toContain(
      'JSON.stringify([uid, revealed, filter, params.toString()])',
    );
    expect(dashboard).toContain(
      'pageState.key === pageKey ? pageState.page : 0',
    );
    expect(dashboard).toContain(
      'recordPage(matchingSafeRecords, page, pageSize)',
    );
    const hook = source('../../features/records/hooks/useOwnRecords.ts');
    expect(hook).toContain('subscribeAuthorizedOwnRecords(');
    expect(hook).toContain(
      '(snapshot) => next(snapshot.rows, snapshot.fromCache)',
    );
    const recordSource = source(
      '../../data/sources/authorized-own-record-source.ts',
    );
    expect(recordSource).toContain('includeMetadataChanges: true');
    expect(recordSource).toContain(
      's.metadata.fromCache || s.metadata.hasPendingWrites',
    );
    // Owner history supplies no pagination options; only paginated callers get limits.
    expect(recordSource).toContain('options.size ? [limit(options.size)] : []');
    expect(hook).not.toContain('size:');
    expect(hook).not.toContain('limit(');
    expect(hook).not.toContain('httpsCallable');
  });
  it('shares the responsive labeled surface across calendar, reports and records', () => {
    for (const name of [
      '../../features/reports/PersonalPage.tsx',
      '../../features/reports/ReportToolbar.tsx',
      '../../features/dashboard/Dashboard.tsx',
    ])
      expect(source(name)).toContain('<QueryToolbar');
    const toolbar = source('../../shared/ui/QueryToolbar.tsx');
    expect(toolbar).toContain('aria-label={label}');
    expect(toolbar).toContain('flex-wrap');
    expect(toolbar).toContain('{actions}');
  });
  it('does not impose calendar domain controls or navigation on other routes', () => {
    const toolbar = source('../../shared/ui/QueryToolbar.tsx');
    for (const term of ['density', 'view=', 'Tabs'])
      expect(toolbar).not.toContain(term);
  });
});
describe('shared filter structure', () => {
  it('owns main/secondary/action slots and field sizing, records have no independent grid', () => {
    const toolbar = source('../../shared/ui/QueryToolbar.tsx');
    for (const slot of [
      'data-query-row="primary"',
      'data-query-row="secondary"',
      'data-query-slot="summary"',
      'data-query-slot="controls"',
      'data-query-slot="actions"',
    ])
      expect(toolbar).toContain(slot);
    expect(toolbar).toContain('w-[calc(50%-6px)] sm:w-40');
    expect(toolbar).toContain('[&_input]:h-11 sm:[&_input]:h-10');
    const records = source('../../features/dashboard/Dashboard.tsx')
      .split('<QueryToolbar')[1]
      .split('</QueryToolbar>')[0];
    expect(records).not.toContain('gridTemplateColumns');
    expect(records).not.toContain('fullWidth');
    expect(records).toContain('secondary=');
    for (const page of [
      '../../features/dashboard/Dashboard.tsx',
      '../../features/reports/ReportToolbar.tsx',
    ])
      expect(source(page)).toContain('<QueryPeriodControls');
    expect(source('../../features/reports/PersonalPage.tsx')).toContain(
      '<QueryToolbarField',
    );
  });
  it('constructs identical date controls for records and reports with small size and same labels', () => {
    const toolbar = source('../../shared/ui/QueryToolbar.tsx');
    expect(toolbar).toContain('export function QueryPeriodControls');
    expect(toolbar).toContain('>Inicial</Label>');
    expect(toolbar).toContain('>Final</Label>');
    expect(toolbar.match(/kind="date"/g)).toHaveLength(2);
  });
});
describe('mobile toolbar regression', () => {
  it('gives summary and controls their own rows and moves actions after secondary filters', () => {
    const toolbar = source('../../shared/ui/QueryToolbar.tsx');
    expect(toolbar).toContain('basis-full sm:w-auto sm:basis-auto');
    expect(toolbar).toContain('flex-[1_0_100%]');
    expect(toolbar).toContain('order-3');
    expect(toolbar).toContain('order-2');
  });
});
