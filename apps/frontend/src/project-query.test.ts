import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const source = (name: string) =>
  readFileSync(new URL('./' + name, import.meta.url), 'utf8');
describe('privacy query lifetime regressions', () => {
  it('permanently clears retained query on account or masking changes, independent of URL filters', () => {
    const dashboard = source('Dashboard.tsx');
    expect(dashboard).toContain("setQuery({ uid, revealed, text: '' });");
    expect(dashboard).toContain('}, [uid, revealed]);');
    expect(dashboard).toContain(
      'query.uid === uid && query.revealed === revealed',
    );
    expect(dashboard).not.toContain('if (revealed) setLocalFilter');
  });
  it('remounts records, report, merge and calendar selectors on masking changes', () => {
    expect(source('Dashboard.tsx')).toContain('key={uid + String(revealed)}');
    expect(source('ReportToolbar.tsx')).toContain('key={String(revealed)}');
    expect(source('ProjectEditor.tsx')).toContain('String(revealed)');
    expect(source('PersonalPage.tsx')).toContain('key={String(revealed)}');
  });
  it('shows all projects until the user types a search, not just the selected label', () => {
    const selector = source('ProjectSelector.tsx');
    expect(selector.replace(/\s+/g, ' ')).toContain(
      "input?.id === projectId && input.label === selected.label ? input.query : ''",
    );
    expect(selector).toContain('matchesProject(option, searchQuery)');
    expect(selector).not.toContain('matchesProject(option, inputValue)');
    expect(selector).toContain('event.currentTarget.select()');
  });
  it('never clears selection due to programmatic reset', () => {
    const selector = source('ProjectSelector.tsx');
    expect(selector).toContain(
      'input?.id === projectId && input.label === selected.label',
    );
    expect(selector).toContain(
      'options.find((option) => option.id === projectId)',
    );
    expect(selector).toContain('onChange(option.id)');
    expect(selector).toContain("onChange('')");
    const typing = selector
      .split('onChange={(event) => {')[1]
      .split('onKeyDown=')[0];
    expect(typing).toContain('setInput');
    expect(typing).not.toContain('onChange(');
    const blur = selector.split('onBlur={(event) => {')[1].split('<Label')[0];
    expect(blur).toContain('setInput(null)');
    expect(blur).not.toContain('onChange(');
  });
});
