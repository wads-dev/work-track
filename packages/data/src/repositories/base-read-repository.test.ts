import { expect, it, vi } from 'vitest';
import { BaseReadRepository } from './base-read-repository.js';
import type {
  DocumentReadPort,
  ReadDocument,
} from '../ports/document-read-port.js';

it('injects the read port and decoder without caching results or inventing missing documents', async () => {
  const getMany = vi.fn<DocumentReadPort['getMany']>().mockResolvedValue([
    { id: 'present', data: { value: 'first' } },
    { id: 'missing', data: undefined },
  ]);
  const decoder = vi.fn((document: ReadDocument) => document.data?.value);
  const repo = new BaseReadRepository({ getMany }, decoder);
  const ids = ['present', 'missing'];
  expect(await repo.readMany('examples', ids)).toEqual(
    new Map([['present', 'first']]),
  );
  expect(getMany).toHaveBeenCalledExactlyOnceWith('examples', ids);
  expect(decoder).toHaveBeenCalledTimes(2);
  getMany.mockResolvedValue([{ id: 'present', data: { value: 'second' } }]);
  expect(await repo.readMany('examples', ids)).toEqual(
    new Map([['present', 'second']]),
  );
  expect(getMany).toHaveBeenCalledTimes(2);
  expect(await repo.readMany('examples', [])).toEqual(new Map());
  expect(getMany).toHaveBeenCalledTimes(2);
});

it('propagates SDK and decoder failures instead of returning partial results', async () => {
  const failure = new Error('read unavailable');
  const getMany = vi
    .fn<DocumentReadPort['getMany']>()
    .mockRejectedValue(failure);
  const repo = new BaseReadRepository({ getMany }, () => 'decoded');
  await expect(repo.readMany('examples', ['a'])).rejects.toBe(failure);
  getMany.mockResolvedValue([
    { id: 'a', data: {} },
    { id: 'b', data: {} },
  ]);
  const invalid = new BaseReadRepository({ getMany }, (document) => {
    if (document.id === 'b') throw failure;
    return 'decoded';
  });
  await expect(invalid.readMany('examples', ['a', 'b'])).rejects.toBe(failure);
});
