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
    expect(chart).toContain('chartPresentation(data, directory.name)');
    expect(
      source('../../data/repositories/metadata-presentation-repository.ts'),
    ).toContain('Number.isFinite(item.minutes) && item.minutes > 0');
  });
  it('keeps company person identity/navigation independent of reveal without inferring topic row user IDs', () => {
    const personal = source('../../features/reports/PersonalPage.tsx');
    const peopleChart = personal.slice(
      personal.indexOf('data={report.byUser.map'),
      personal.indexOf('}))}', personal.indexOf('data={report.byUser.map')),
    );
    expect(peopleChart).toContain("kind: 'person' as const");
    expect(peopleChart).toContain('uid: person.uid');
    expect(peopleChart).toContain('companyPeople.name(person.uid)');
    expect(peopleChart).toMatch(/href:\s*person\.uid/);
    expect(peopleChart).not.toContain('revealed');
    expect(source('../../features/reports/InteractiveChart.tsx')).not.toContain(
      'usePrivacy',
    );
    expect(source('../../features/reports/ProjectReport.tsx')).toContain(
      'person.uid',
    );
    expect(source('../../features/reports/TopicReport.tsx')).toContain(
      'person.uid',
    );
    expect(source('../../features/reports/TopicReport.tsx')).not.toContain(
      'encodeURIComponent(person.key)',
    );
    const topicMetadata = source(
      '../../data/repositories/derived-report-repository.ts',
    );
    expect(topicMetadata).toContain('detailsAvailable: !hidden');
    expect(topicMetadata).toContain("topicLabel: hidden ? 'Tópico reservado'");
    expect(topicMetadata).toContain('uid: person.uid');
  });
  it('keeps profile target fixed while reusing authorized calendar and viewer identity', () => {
    const profile = source('../../features/people/PersonPage.tsx');
    expect(profile).toContain("params.get('uid') === personId");
    expect(profile).toContain("next.set('uid', personId)");
    expect(profile).toContain('uid={uid}');
    expect(profile).toContain('calendar');
    expect(source('../../features/reports/PersonalPage.tsx')).toContain(
      'personDisabled={profile}',
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
