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
