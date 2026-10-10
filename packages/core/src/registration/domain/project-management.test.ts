import { expect, it } from 'vitest';
import {
  githubUrl,
  publicAlias,
  mergeProjectsInput,
  mapTopics,
  assertProjectWritable,
} from './project-management.js';
it('accepts only exact HTTPS GitHub repository URLs', () => {
  expect(
    githubUrl.safeParse('https://github.com/wads/work-track').success,
  ).toBe(true);
  for (const url of [
    'git@github.com:wads/repo',
    'http://github.com/wads/repo',
    'https://github.com.evil/wads/repo',
    'https://user@github.com/wads/repo',
    'https://github.com/wads/repo?q=x',
    'https://github.com/wads/repo#x',
    'https://github.com/wads/repo/',
    'https://github.com/wads/repo/issues',
  ])
    expect(githubUrl.safeParse(url).success).toBe(false);
});
it('requires neutral aliases and explicit confirmed merge IDs/reason', () => {
  expect(publicAlias.safeParse('Projeto reservado 12').success).toBe(true);
  expect(publicAlias.safeParse('Cliente X').success).toBe(false);
  expect(
    mergeProjectsInput.safeParse({ sourceProjectId: 'a', targetProjectId: 'a' })
      .success,
  ).toBe(false);
  expect(
    mergeProjectsInput.safeParse({
      sourceProjectId: 'a',
      targetProjectId: 'b',
      confirmed: true,
    }).success,
  ).toBe(false);
  expect(
    mergeProjectsInput.parse({ sourceProjectId: 'a', targetProjectId: 'b' })
      .confirmed,
  ).toBe(false);
});
it('reconciles general and normalized titles without mutating inputs', () => {
  const target = [
    { id: 'general', title: 'Geral', description: 'Default' },
    { id: 'target-code', title: 'Código', description: 'Code' },
  ];
  const source = [
    { id: 'general', title: 'Geral', description: 'Default' },
    { id: 'source-code', title: 'codigo', description: 'Code' },
    { id: 'new', title: 'Meeting', description: 'Meet' },
  ];
  const result = mapTopics(source, target);
  expect(result.mapping).toEqual({
    general: 'general',
    'source-code': 'target-code',
    new: 'new',
  });
  expect(target).toHaveLength(2);
  expect(result.topics).toHaveLength(3);
});
it('blocks archived and locked projects, preventing cycles/races', () => {
  for (const value of [
    { mergeLock: 'job' },
    { archived: true },
    { mergedInto: 'other' },
  ])
    expect(() => assertProjectWritable(value)).toThrow('mesclagem');
  expect(() => assertProjectWritable({})).not.toThrow();
});
