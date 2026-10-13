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
    expect(dashboard).toContain('page: activePage, size: pageSize');
    expect(dashboard).not.toContain('recordPage(');
    expect(dashboard).not.toContain('filterRecords(');
    const hook = source('../../features/records/hooks/useOwnRecords.ts');
    expect(hook).toContain('subscribeAuthorizedOwnRecords(');
    expect(hook).toContain('selection,');
    const recordSource = source(
      '../../data/sources/authorized-own-record-source.ts',
    );
    expect(recordSource).toContain(
      'readOwnRecordListing(db, uid, ids, options)',
    );
    expect(recordSource).toContain('if (!snapshot.complete) return;');
    // Snapshot content may invalidate native queries, never select/publish rows.
    expect(recordSource).not.toContain('snapshot.records.filter');
    expect(recordSource).not.toContain('rows: snapshot.records');
    for (const text of [recordSource, hook]) {
      for (const remote of [
        'onSnapshot',
        'getDocs(',
        'getDoc(',
        'httpsCallable',
      ])
        expect(text).not.toContain(remote);
      expect(text).not.toContain('.filter(');
      expect(text).not.toContain('.slice(');
    }
  });
  it('shares the responsive labeled surface across calendar, reports and records', () => {
    for (const name of [
      '../../features/reports/CalendarToolbar.tsx',
      '../../features/reports/ReportToolbar.tsx',
    ])
      expect(source(name)).toContain('<QueryToolbar');
    expect(source('../../features/records/RecordsToolbar.tsx')).toContain(
      '<CompactListToolbar',
    );
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
    const records = source('../../features/records/RecordsToolbar.tsx');
    expect(records).toContain('<CompactListToolbar');
    expect(records).not.toContain('secondary=');
    expect(records).not.toContain('Fuso do período');
    expect(source('../../features/reports/ReportToolbar.tsx')).toContain(
      '<QueryPeriodControls',
    );
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
