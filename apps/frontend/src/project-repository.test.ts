import { describe, it, expect, vi } from 'vitest';
import {
  createProjectRepository,
  StaleProjectResponse,
} from './project-repository';
import { matchesProject } from './project-search';
describe('authorized memory repository', () => {
  it('deduplicates concurrent scopes and caches until refresh', async () => {
    const r = createProjectRepository<string[]>(),
      o = {};
    const f = vi.fn(async () => ['private', 'work']);
    await Promise.all([r.load(o, 'a', 'all', f), r.load(o, 'a', 'work', f)]);
    await r.load(o, 'a', 'personal', f);
    expect(f).toHaveBeenCalledTimes(1);
    r.invalidate();
    await r.load(o, 'a', 'all', f);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('isolates account and Functions instance', async () => {
    const r = createProjectRepository<string[]>(),
      o = {};
    const f = vi.fn(async () => ['ok']);
    await r.load(o, 'a', 'all', f);
    await r.load(o, 'b', 'all', f);
    await r.load({}, 'a', 'all', f);
    expect(f).toHaveBeenCalledTimes(3);
    r.account('a');
    r.account('');
    await r.load(o, 'a', 'all', f);
    expect(f).toHaveBeenCalledTimes(4);
  });
  it('rejects stale mutation and account responses', async () => {
    for (const invalidate of ['mutation', 'account']) {
      const r = createProjectRepository<string[]>();
      let resolve!: (v: string[]) => void;
      const pending = r.load(
        {},
        'a',
        'all',
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      if (invalidate === 'mutation') r.invalidate();
      else r.account('b');
      resolve(['stale']);
      await expect(pending).rejects.toBeInstanceOf(StaleProjectResponse);
    }
  });
  it('does not cache errors or partial results', async () => {
    const r = createProjectRepository<string[]>(),
      o = {};
    await expect(
      r.load(o, 'a', 'all', async () => {
        throw Error('denied');
      }),
    ).rejects.toThrow('denied');
    expect(await r.load(o, 'a', 'all', async () => ['fresh'])).toEqual([
      'fresh',
    ]);
  });
  it('notifies active consumers on invalidation', () => {
    const r = createProjectRepository(),
      fn = vi.fn();
    const stop = r.subscribe(fn);
    r.invalidate();
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
    r.invalidate();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('matches authorized raw data while keeping rendered labels neutral', () => {
    const option = {
      id: 'allowed',
      label: 'Projeto reservado',
      searchText: 'Título Confidencial Árvore',
    };
    expect(matchesProject(option, 'arvore')).toBe(true);
    expect(option.label).toBe('Projeto reservado');
    expect(matchesProject(option, 'foreign absent')).toBe(false);
  });
});
