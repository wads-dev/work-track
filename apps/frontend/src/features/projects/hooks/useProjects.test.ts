import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('keys scope/search/page/ID options, forwards them to source and never filters the hook dataset', () => {
  const source = readFileSync(
    new URL('./useProjects.ts', import.meta.url),
    'utf8',
  );
  expect(source).toContain('ProjectReadOptions');
  expect(source).toContain('listingKey(');
  expect(source).toMatch(/selection,?\s*\);/);
  expect(source).not.toContain('.filter(');
  expect(source).not.toContain('onSnapshot');
  expect(source).toContain('state.key === key');
});
