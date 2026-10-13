import { expect, it } from 'vitest';
import { ProjectAppearance } from '@work-track/core/registration/domain/project-color';
import { projectColors } from './project-colors';

it('returns repository-joined colors with the complete authorized palette and hidden configured colors masked', () => {
  const catalog = [
    { id: 'first', data: { color: '#f97316' } },
    { id: 'selected', data: { color: '#123abc', confidential: true } },
    { id: 'automatic', data: {} },
  ];
  const colors = projectColors(catalog, false);
  expect(colors('first')).toBe('#f97316');
  expect(colors('selected')).not.toBe('#123abc');
  expect(colors('automatic')).toBe(
    new ProjectAppearance({ id: 'automatic' }).getColor([
      { id: 'first', color: '#f97316' },
      { id: 'selected' },
      { id: 'automatic' },
    ]),
  );
  expect(projectColors(catalog, true)('selected')).toBe('#123abc');
  expect(projectColors([...catalog].reverse(), false)('automatic')).toBe(
    colors('automatic'),
  );
  expect(projectColors([], false)('missing')).toMatch(/^#[0-9a-f]{6}$/);
});
