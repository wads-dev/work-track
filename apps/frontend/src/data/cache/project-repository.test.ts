import { describe, it, expect, vi } from 'vitest';
import { createProjectRepository } from './project-repository';
import { matchesProject } from '../../features/projects/project-search';
describe('project lifecycle events without a document cache', () => {
  it('does not expose document loading, value caching or promise deduplication', () => {
    const repo = createProjectRepository();
    expect(Object.keys(repo).sort()).toEqual([
      'account',
      'invalidate',
      'subscribe',
    ]);
  });
  it('notifies account changes, but not repeated identities', () => {
    const repo = createProjectRepository(),
      notify = vi.fn();
    repo.subscribe(notify);
    repo.account('alice');
    repo.account('alice');
    repo.account('');
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it('notifies current consumers on invalidation and detaches stopped consumers', () => {
    const repo = createProjectRepository(),
      notify = vi.fn();
    const stop = repo.subscribe(notify);
    repo.invalidate();
    expect(notify).toHaveBeenCalledOnce();
    stop();
    repo.invalidate();
    expect(notify).toHaveBeenCalledOnce();
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
