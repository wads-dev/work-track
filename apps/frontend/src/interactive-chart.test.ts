import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { safeReturnTo } from './routes';
const source = (file: string) =>
  readFileSync(new URL('./' + file, import.meta.url), 'utf8');
describe('interactive charts', () => {
  it('uses library tooltips, stable identity, formatted values and accessible navigation', () => {
    const chart = source('InteractiveChart.tsx');
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
    expect(source('PersonalPage.tsx')).toMatch(
      /href:\s*revealed && person\.uid/,
    );
    expect(source('ProjectReport.tsx')).toContain(
      'uid: hidden ? undefined : person.uid',
    );
    expect(source('TopicReport.tsx')).toContain('person.uid');
    expect(source('TopicReport.tsx')).not.toContain(
      'encodeURIComponent(person.key)',
    );
    expect(source('topic-report-model.ts')).toContain(
      'revealed && !hidden && !personalUid',
    );
  });
  it('keeps profile target fixed while reusing authorized calendar and viewer identity', () => {
    const profile = source('PersonPage.tsx');
    expect(profile).toContain("params.get('uid') === personId");
    expect(profile).toContain("next.set('uid', personId)");
    expect(profile).toContain('uid={uid}');
    expect(profile).toContain('calendar');
    expect(source('PersonalPage.tsx')).toContain('loading || profile');
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
