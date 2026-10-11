import { expect, it } from 'vitest';
import {
  repositoryIdentity,
  searchRepositoryContext,
} from './repository-search.js';
import type { Project } from './work-model.js';
const project: Project = {
  id: 'sh',
  title: 'SH',
  description: 'Projeto',
  createdBy: 'alice',
  createdAt: '2026-10-11',
  type: 'work',
  topics: [
    {
      id: 'wt',
      title: 'Work Track',
      description: 'Registro',
      githubUrl: 'https://github.com/wads-dev/work-track',
    },
  ],
};
it('normalizes Git remotes without contacting GitHub', () => {
  expect(repositoryIdentity('git@github.com:wads-dev/Work-Track.git')).toBe(
    'wads-dev/work-track',
  );
  expect(repositoryIdentity('https://github.com/wads-dev/work-track/')).toBe(
    'wads-dev/work-track',
  );
  expect(() => repositoryIdentity('https://github.com.evil/a/b')).toThrow();
});
it('finds the associated topic and supports approximate names', () => {
  expect(
    searchRepositoryContext([project], 'wads-dev/work-track', 'alice')
      .matches[0],
  ).toMatchObject({
    projectId: 'sh',
    topicId: 'wt',
    matchType: 'exact_repository',
  });
  expect(
    searchRepositoryContext([project], 'work-trak', 'alice').matches[0]
      ?.topicId,
  ).toBe('wt');
});
it('does not expose other personal projects or archived topics', () => {
  expect(
    searchRepositoryContext(
      [{ ...project, type: 'personal' }],
      'work-track',
      'bob',
    ).matches,
  ).toEqual([]);
  expect(
    searchRepositoryContext(
      [
        {
          ...project,
          topics: project.topics.map((t) => ({ ...t, archived: true })),
        },
      ],
      'work-track',
      'alice',
    ).matches,
  ).toEqual([]);
});
