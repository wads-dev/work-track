import { expect, it } from 'vitest';
import { ProjectDiscoveryRepository } from './project-discovery-repository.js';
it('shares historical and personal authorization independently of SDK', async () => {
  const docs = [
    { id: 'historical', data: {} },
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
  ).toEqual(['mine', 'work']);
});
it('forwards repository selection and keeps historical active work while excluding archive/merge/private before search limit', async () => {
  const docs = [
    {
      id: 'historical',
      data: {
        type: 'work',
        title: 'Project',
        description: 'Synthetic',
        topics: [],
      },
    },
    {
      id: 'archive',
      data: {
        type: 'work',
        title: 'Project',
        description: 'Synthetic',
        topics: [],
        archived: true,
      },
    },
    {
      id: 'merged',
      data: {
        type: 'work',
        title: 'Project',
        description: 'Synthetic',
        topics: [],
        mergedInto: 'historical',
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
  ).toEqual(['historical']);
  expect(passed).toEqual(options);
  expect(
    (
      await repository.list('alice', {
        ...options,
        includeArchived: true,
        limit: 10,
      })
    ).map((doc) => doc.id),
  ).toEqual(['archive', 'historical', 'merged']);
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
