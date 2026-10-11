import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QueryToolbar,
  QueryToolbarField,
  QueryPeriodControls,
} from '../../shared/ui/QueryToolbar';
import { layoutTokens } from '../../shared/ui/layout-tokens';
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
    expect(recordSource).toContain('recordSnapshot.metadata.fromCache ||');
    // Owner history supplies no pagination options; only paginated callers get limits.
    expect(recordSource).toContain('options.size ? [limit(options.size)] : []');
    expect(hook).not.toContain('size:');
    expect(hook).not.toContain('limit(');
    expect(hook).not.toContain('httpsCallable');
  });
  it('shares the responsive labeled surface across calendar, reports and records', () => {
    for (const name of [
      '../../features/reports/CalendarToolbar.tsx',
      '../../features/reports/ReportToolbar.tsx',
      '../../features/dashboard/Dashboard.tsx',
    ])
      expect(source(name)).toContain('<QueryToolbar');
    const toolbar = source('../../shared/ui/QueryToolbar.tsx');
    expect(toolbar).toContain('<FilterBar');
    expect(toolbar).not.toContain('layoutTokens.surface');
    expect(layoutTokens.wrapRow).toContain('flex-wrap');
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
    expect(layoutTokens.fieldWidths.date).toBe('w-[calc(50%-4px)] sm:w-40');
    expect(layoutTokens.controls).toContain('[&_input]:h-11 sm:[&_input]:h-9');
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
      '<CalendarToolbar',
    );
    expect(source('../../features/reports/CalendarToolbar.tsx')).toContain(
      '<QueryToolbar',
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

describe('compact toolbar contract', () => {
  const field = () =>
    createElement(QueryToolbarField, {
      children: createElement(
        'label',
        null,
        createElement('span', null, 'Visualização'),
        createElement(
          'button',
          { role: 'combobox', 'aria-label': 'Visualização' },
          'Semana',
        ),
      ),
    });
  const toolbar = (compact?: boolean) =>
    renderToStaticMarkup(
      createElement(QueryToolbar, {
        label: 'Filtros',
        compact,
        children: field(),
        actions: createElement(
          'button',
          { 'aria-label': 'Atualizar' },
          'Atualizar',
        ),
        secondary: createElement(QueryToolbarField, {
          kind: 'project',
          children: createElement('input', { 'aria-label': 'Projeto' }),
        }),
      }),
    );

  it('opts in without removing labels or changing unrelated forms', () => {
    const regular = toolbar();
    expect(regular).toContain('data-query-compact="false"');
    expect(regular).toContain('sm:w-[180px]');
    expect(regular).not.toContain(']:sr-only');
    const standalone = renderToStaticMarkup(field());
    expect(standalone).not.toContain(']:sr-only');
    expect(standalone).toContain('sm:w-[180px]');
  });

  it('shares one wrapping flex flow for controls, actions and secondary fields', () => {
    const compact = toolbar(true);
    expect(compact).toContain('data-query-compact="true"');
    expect(compact).toContain(layoutTokens.wrapRow);
    for (const slot of [
      'data-query-slot="controls"',
      'data-query-row="secondary"',
    ])
      expect(compact).toContain(slot + ' class="contents"');
    expect(compact).toContain('data-query-slot="actions"');
    expect(compact).toContain('ml-auto shrink-0 justify-end');
    expect(compact).not.toContain('order-2');
    expect(compact).not.toContain('order-3');
    expect(compact).not.toContain('border-t');
    expect(compact).toContain('w-auto min-w-[110px]');
    expect(compact).toContain('w-[200px]');
    expect(compact).not.toContain('sm:w-[180px]');
  });

  it('hides only captions, not wrapping labels containing selects or inputs', () => {
    expect(layoutTokens.compactFieldLabels).toContain(
      'label:not(:has(input,button,select))]:sr-only',
    );
    expect(layoutTokens.compactFieldLabels).not.toContain('[&_label]:sr-only');
    expect(layoutTokens.compactFieldLabels).not.toContain('hidden');
    const compact = toolbar(true);
    expect(compact).toContain('aria-label="Visualização"');
    expect(compact).toContain('role="combobox"');
    expect(compact).toContain('>Semana</button>');
    expect(compact).toContain('>Visualização</span>');
    expect(compact).toContain('aria-label="Projeto"');
    expect(compact).toContain('aria-label="Atualizar"');
  });

  it('preserves date label associations when compact', () => {
    const markup = renderToStaticMarkup(
      createElement(QueryToolbar, {
        label: 'Período',
        compact: true,
        children: createElement(QueryPeriodControls, {
          fromDate: '2026-10-01',
          toDate: '2026-10-08',
          onFromChange: () => {},
          onToChange: () => {},
        }),
      }),
    );
    const labels = [
      ...markup.matchAll(
        /<label[^>]*for="([^"]+)"[^>]*>(Inicial|Final)<\/label>/g,
      ),
    ];
    expect(labels).toHaveLength(2);
    for (const [, id] of labels) expect(markup).toContain('id="' + id + '"');
    expect(markup.match(/type="date"/g)).toHaveLength(2);
  });
});
