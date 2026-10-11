import { it, expect } from 'vitest';
import {
  loadAllProjects,
  sortProjectRows,
  clearProjectFilters,
} from './project-list';
it('sorts Portuguese names ignoring case and accents without mutating the catalog', () => {
  const rows = ['zebra', 'beta', 'Árvore', 'alfa'].map((title, index) => ({
    id: String(index),
    data: { title },
  }));
  expect(sortProjectRows(rows).map((p) => p.data.title)).toEqual([
    'alfa',
    'Árvore',
    'beta',
    'zebra',
  ]);
  expect(rows[0]!.data.title).toBe('zebra');
  const equalNames = [
    { id: 'b', data: { title: 'área' } },
    { id: 'a', data: { title: 'AREA' } },
  ];
  expect(sortProjectRows(equalNames).map((p) => p.id)).toEqual(['a', 'b']);
});
it.each(['work', 'personal'])(
  'clears filters preserving the %s scope and unrelated navigation',
  (scope) => {
    const params = new URLSearchParams({
      scope,
      q: 'query',
      status: 'archived',
      project: 'p',
      tab: 'details',
    });
    const result = clearProjectFilters(params);
    expect(result.get('scope')).toBe(scope);
    expect(result.get('tab')).toBe('details');
    expect(result.has('q')).toBe(false);
    expect(result.has('status')).toBe(false);
    expect(result.has('project')).toBe(false);
    expect(params.get('status')).toBe('archived');
  },
);
it('collects every authorized page before publishing', async () => {
  const cursors: (string | undefined)[] = [];
  const all = await loadAllProjects(async (cursor) => {
    cursors.push(cursor);
    return cursor
      ? { projects: [{ id: 'b' }] }
      : { projects: [{ id: 'a' }], nextCursor: 'a' };
  });
  expect(all.map((p) => p.id)).toEqual(['a', 'b']);
  expect(cursors).toEqual([undefined, 'a']);
});
it('fails closed when cursor repeats', async () => {
  await expect(
    loadAllProjects(async () => ({ projects: [], nextCursor: 'repeat' })),
  ).rejects.toThrow();
});
it('does not return partial data when later page fails', async () => {
  await expect(
    loadAllProjects(async (cursor) => {
      if (cursor) throw new Error('denied');
      return { projects: [{ id: 'first' }], nextCursor: 'first' };
    }),
  ).rejects.toThrow('denied');
});
