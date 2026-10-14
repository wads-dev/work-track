import { expect, it } from 'vitest';
import { ProjectDiscoveryRepository } from './project-discovery-repository.js';
it('rejects missing type and enforces personal authorization independently of SDK', async () => {
  const docs = [
    { id: 'missing-type', data: {} },
    {
      id: 'work',
      data: {
        archived: false,
        confidential: false,
        createdBy: 'alice',
        topics: [],
        type: 'work',
      },
    },
    {
      id: 'mine',
      data: {
        archived: false,
        confidential: false,
        topics: [],
        type: 'personal',
        createdBy: 'alice',
      },
    },
    {
      id: 'other',
      data: {
        archived: false,
        confidential: false,
        topics: [],
        type: 'personal',
        createdBy: 'bob',
      },
    },
  ];
  expect(
    (
      await new ProjectDiscoveryRepository({
        scanProjects: () => Promise.resolve(docs),
      }).list('alice')
    ).map((d) => d.id),
  ).toEqual(['mine', 'work']);
});
it('forwards repository selection and keeps explicit active work while excluding archive/merge/private before search limit', async () => {
  const docs = [
    {
      id: 'active',
      data: {
        confidential: false,
        createdBy: 'alice',
        archived: false,
        type: 'work',
        title: 'Project',
        description: 'Synthetic',
        topics: [],
      },
    },
    {
      id: 'archive',
      data: {
        confidential: false,
        createdBy: 'alice',
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
        confidential: false,
        createdBy: 'alice',
        archived: false,
        type: 'work',
        title: 'Project',
        description: 'Synthetic',
        topics: [],
        mergedInto: 'active',
      },
    },
    {
      id: 'private',
      data: {
        confidential: false,
        archived: false,
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
  ).toEqual(['active']);
  expect(passed).toEqual(options);
  expect(
    (
      await repository.list('alice', {
        ...options,
        includeArchived: true,
        limit: 10,
      })
    ).map((doc) => doc.id),
  ).toEqual(['active', 'archive', 'merged']);
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
it('rejects accessible malformed metadata instead of defaulting its state', () => {
  for (const patch of [
    { archived: undefined },
    { confidential: undefined },
    { topics: undefined },
    { topics: null },
  ]) {
    expect(() =>
      ProjectDiscoveryRepository.selected(
        [
          {
            id: 'bad',
            data: {
              type: 'work',
              createdBy: 'alice',
              archived: false,
              confidential: false,
              topics: [],
              ...patch,
            },
          },
        ],
        'alice',
      ),
    ).toThrow();
  }
});
