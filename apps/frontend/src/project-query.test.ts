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
  it('never clears selection due to programmatic reset', () => {
    const selector = source('ProjectSelector.tsx');
    expect(selector).toContain("reason === 'input'");
    expect(selector).toContain(
      "reason === 'selectOption' || reason === 'clear'",
    );
    expect(selector).toContain('a.id === b.id');
  });
});
