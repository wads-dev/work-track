import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { safeReturnTo } from '../../app/routes';
const source = (file: string) =>
  readFileSync(new URL('./' + file, import.meta.url), 'utf8');
describe('interactive charts', () => {
  it('shows only avatars on the people axis and one dashboard legend', () => {
    expect(source('../../features/reports/InteractiveChart.tsx')).toContain(
      'avatarOnly',
    );
    expect(source('../../features/reports/PersonalPage.tsx')).not.toContain(
      'report.byUser.map((person, index) => (\n',
    );
  });
  it('uses library tooltips, stable identity, formatted values and accessible navigation', () => {
    const chart = source('../../features/reports/InteractiveChart.tsx');
    for (const token of [
      'recharts',
      'ResponsiveContainer',
      'Tooltip',
      'item.label',
      'hours(item.minutes)',
      'key={item.key}',
      '<Link',
      'onSelect',
      'isAnimationActive={false}',
      'accessibilityLayer',
    ])
      expect(chart).toContain(token);
    expect(chart).toContain(
      'Number.isFinite(item.minutes) && item.minutes > 0',
    );
  });
  it('does not navigate masked people or infer user IDs from topic row indexes', () => {
    expect(source('../../features/reports/PersonalPage.tsx')).toMatch(
      /href:\s*revealed && person\.uid/,
    );
    expect(source('../../features/reports/ProjectReport.tsx')).toContain(
      'uid: hidden ? undefined : person.uid',
    );
    expect(source('../../features/reports/TopicReport.tsx')).toContain(
      'person.uid',
    );
    expect(source('../../features/reports/TopicReport.tsx')).not.toContain(
      'encodeURIComponent(person.key)',
    );
    expect(source('../../features/reports/topic-report-model.ts')).toContain(
      'revealed && !hidden',
    );
  });
  it('keeps profile target fixed while reusing authorized calendar and viewer identity', () => {
    const profile = source('../../features/people/PersonPage.tsx');
    expect(profile).toContain("params.get('uid') === personId");
    expect(profile).toContain("next.set('uid', personId)");
    expect(profile).toContain('uid={uid}');
    expect(profile).toContain('calendar');
    expect(source('../../features/reports/PersonalPage.tsx')).toContain(
      'loading || profile',
    );
  });
  it('allows only safe local profile returns', () => {
    expect(safeReturnTo('/people/user-1?date=2026-10-09')).toBe(
      '/people/user-1?date=2026-10-09',
    );
    for (const value of [
      '//evil.test/people/a',
      '/people/a%2fb',
      '/people/a/extra',
    ])
      expect(safeReturnTo(value)).toBe('/app');
  });
});
