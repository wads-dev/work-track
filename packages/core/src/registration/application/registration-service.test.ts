import { expect, it, vi } from 'vitest';
import { RegistrationService } from './registration-service.js';
import type { WorkRepository } from '../domain/work-model.js';
it('delegates every project search selection to repository and preserves the prepared result', async () => {
  const prepared = [{ id: 'selected', title: 'Result', score: 0.95 }];
  const listProjects = vi.fn().mockResolvedValue(prepared);
  const service = new RegistrationService({
    listProjects,
  } as unknown as WorkRepository);
  expect(await service.search('typed query', 10, 'alice', true)).toEqual({
    projects: prepared,
  });
  expect(listProjects).toHaveBeenCalledExactlyOnceWith('alice', {
    query: 'typed query',
    limit: 10,
    includeArchived: true,
  });
});
