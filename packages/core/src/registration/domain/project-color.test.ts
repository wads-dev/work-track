import { expect, it } from 'vitest';
import { ProjectAppearance, projectPalette } from './project-color.js';
import { updateProjectInput } from './project-management.js';
it('uses all distinct palette colors before repeating for colliding ids', () => {
  const catalog = Array.from({ length: 8 }, (_, i) => ({ id: 'project-' + i }));
  const colors = catalog.map((p) => new ProjectAppearance(p).getColor(catalog));
  expect(new Set(colors).size).toBe(8);
  expect(new Set(colors)).toEqual(new Set(projectPalette));
  expect(
    catalog.map((p) =>
      new ProjectAppearance(p).getColor([...catalog].reverse()),
    ),
  ).toEqual(colors);
});
it('explicit color wins and automatic colors avoid it', () => {
  const catalog = [{ id: 'a', color: '#DC2626' }, { id: 'b' }];
  expect(new ProjectAppearance(catalog[0]!).getColor(catalog)).toBe('#dc2626');
  expect(new ProjectAppearance(catalog[1]!).getColor(catalog)).not.toBe(
    '#dc2626',
  );
});
it('invalid or cleared colors fall back safely and editing validates hex', () => {
  expect(
    new ProjectAppearance({ id: 'a', color: 'url(evil)' }).getColor(),
  ).toBe(new ProjectAppearance({ id: 'a' }).getColor());
  const input = {
    projectId: 'p',
    requestId: 'r',
    reason: 'Cor',
    color: '#ff0000',
  };
  expect(updateProjectInput.parse(input).color).toBe('#ff0000');
  expect(updateProjectInput.parse({ ...input, color: null }).color).toBeNull();
  expect(() => updateProjectInput.parse({ ...input, color: 'red' })).toThrow();
});
