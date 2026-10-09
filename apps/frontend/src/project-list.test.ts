import { it, expect } from 'vitest';
import { loadAllProjects } from './project-list';
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
