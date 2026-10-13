import { expect, it } from 'vitest';
import { ProjectDiscoveryRepository } from './project-discovery-repository.js';
it('shares legacy and personal authorization independently of SDK', async () => {
  const docs = [
    { id: 'legacy', data: {} },
    { id: 'work', data: { type: 'work' } },
    { id: 'mine', data: { type: 'personal', createdBy: 'alice' } },
    { id: 'other', data: { type: 'personal', createdBy: 'bob' } },
  ];
  expect(
    (
      await new ProjectDiscoveryRepository({
        scanProjects: () => Promise.resolve(docs),
      }).list('alice')
    ).map((d) => d.id),
  ).toEqual(['legacy', 'mine', 'work']);
});
it('forwards repository selection and keeps legacy active work while excluding archive/merge/private before search limit', async () => {
  const docs = [
    {
      id: 'legacy',
      data: { title: 'Project', description: 'Synthetic', topics: [] },
    },
    {
      id: 'archive',
      data: {
        title: 'Project',
        description: 'Synthetic',
        topics: [],
        archived: true,
      },
    },
    {
      id: 'merged',
      data: {
        title: 'Project',
        description: 'Synthetic',
        topics: [],
        mergedInto: 'legacy',
      },
    },
    {
      id: 'private',
      data: {
        type: 'personal',
        createdBy: 'bob',
        title: 'Project',
        description: 'Synthetic',
        topics: [],
      },
    },
  ];
  let passed: unknown;
  const repository = new ProjectDiscoveryRepository({
    scanProjects: (_limit, options) => {
      passed = options;
      return Promise.resolve(docs);
    },
  });
  const options = {
    scope: 'work' as const,
    includeArchived: false,
    query: 'project',
    limit: 1,
  };
  expect(
    (await repository.list('alice', options)).map((doc) => doc.id),
  ).toEqual(['legacy']);
  expect(passed).toEqual(options);
  expect(
    (
      await repository.list('alice', {
        ...options,
        includeArchived: true,
        limit: 10,
      })
    ).map((doc) => doc.id),
  ).toEqual(['archive', 'legacy', 'merged']);
});
it('never returns silently truncated catalog', async () => {
  await expect(
    new ProjectDiscoveryRepository({
      scanProjects: () =>
        Promise.resolve(
          Array.from({ length: 1001 }, (_, i) => ({ id: String(i), data: {} })),
        ),
    }).list('alice'),
  ).rejects.toThrow('orçamento');
});
