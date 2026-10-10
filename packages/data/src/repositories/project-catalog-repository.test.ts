import { expect, it, vi } from 'vitest';
import { ProjectCatalogRepository } from './project-catalog-repository.js';
import type { DocumentReadPort } from '../ports/document-read-port.js';

it('deduplicates projects, reads sequential100 batches and omits missing documents', async () => {
  const getMany = vi
    .fn<DocumentReadPort['getMany']>()
    .mockImplementation((_collection, ids) =>
      Promise.resolve(
        ids.map((id) => ({
          id,
          data: id === 'p100' ? undefined : { type: 'work' },
        })),
      ),
    );
  const repo = new ProjectCatalogRepository({ getMany }, 'admin');
  const ids = Array.from({ length: 205 }, (_, i) => 'p' + i);
  const catalog = await repo.readCatalog([...ids, 'p0']);
  expect(
    getMany.mock.calls.map(([path, values]) => [path, values.length]),
  ).toEqual([
    ['projects', 100],
    ['projects', 100],
    ['projects', 5],
  ]);
  expect([...catalog.keys()]).toEqual(ids.filter((id) => id !== 'p100'));
  expect(catalog.get('p0')).toMatchObject({ type: 'work', topics: [] });
  getMany.mockClear();
  expect(await repo.readCatalog([])).toEqual(new Map());
  expect(getMany).not.toHaveBeenCalled();
});

it('uses the exact same mode decoder for synchronous snapshots without invoking a read port', async () => {
  const document = {
    id: 'p',
    data: {
      type: null,
      topics: [{ id: 't', title: 'Title', extra: true }, null],
    },
  };
  const getMany = vi
    .fn<DocumentReadPort['getMany']>()
    .mockResolvedValue([document]);
  for (const mode of ['admin', 'personal-web', 'authorized-web'] as const) {
    const expected = ProjectCatalogRepository.decodeDocument(document, mode);
    expect(
      (
        await new ProjectCatalogRepository({ getMany }, mode).readCatalog(['p'])
      ).get('p'),
    ).toEqual(expected);
    expect(expected?.type).toBe('__invalid__');
  }
  getMany.mockClear();
  expect(
    ProjectCatalogRepository.decodeDocument(
      { id: 'gone', data: undefined },
      'admin',
    ),
  ).toBeUndefined();
  expect(getMany).not.toHaveBeenCalled();
});

it('does not return a partial catalog when a later SDK batch fails', async () => {
  const getMany = vi
    .fn<DocumentReadPort['getMany']>()
    .mockResolvedValueOnce([{ id: 'p0', data: {} }])
    .mockRejectedValueOnce(new Error('permission-denied'));
  const repo = new ProjectCatalogRepository({ getMany }, 'admin');
  await expect(
    repo.readCatalog(Array.from({ length: 101 }, (_, i) => 'p' + i)),
  ).rejects.toThrow('permission-denied');
});
