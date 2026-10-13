import { expect, it } from 'vitest';
import type { Project } from './work-model.js';
import {
  canAccessProject,
  assertProjectAccess,
  assertProjectMergeAccess,
  effectiveProjectType,
} from './project-access.js';
it('owner-only personal, shared explicit work, malformed fail closed', () => {
  expect(
    canAccessProject({ type: 'personal', createdBy: 'alice' }, 'alice'),
  ).toBe(true);
  expect(
    canAccessProject({ type: 'personal', createdBy: 'alice' }, 'bob'),
  ).toBe(false);
  expect(canAccessProject({ type: 'personal' }, 'alice')).toBe(false);
  expect(canAccessProject({ type: 'work' }, 'bob')).toBe(true);
  const confidentialWork = {
    type: 'work',
    confidential: true,
    createdBy: 'alice',
  };
  expect(canAccessProject(confidentialWork, 'bob')).toBe(true);
  for (const project of [{}, { type: undefined }, { type: 'unknown' }]) {
    expect(canAccessProject(project, 'alice')).toBe(false);
    expect(() => assertProjectAccess(project, 'alice')).toThrow(
      'Projeto não encontrado.',
    );
  }
  expect(canAccessProject({}, 'bob')).toBe(false);
  expect(canAccessProject({ type: 'weird' }, 'bob')).toBe(false);
  expect(effectiveProjectType({})).toBe('invalid');
  for (const p of [undefined, { type: 'personal', createdBy: 'alice' }])
    expect(() => assertProjectAccess(p, 'bob')).toThrow(
      'Projeto não encontrado.',
    );
});
it('rejects crossproject topic alias migration until canonical migration is implemented', () => {
  const p = {
    type: 'work',
    topics: [{ id: 'old', mergedIntoTopicId: 'canonical' }],
  } as Project;
  expect(() => assertProjectMergeAccess(p, { type: 'work' }, 'alice')).toThrow(
    'migração canônica',
  );
});
it('merges never broaden personal scope or transfer other owners', () => {
  const p = { type: 'personal', createdBy: 'alice' };
  expect(() => assertProjectMergeAccess(p, p, 'alice')).not.toThrow();
  expect(() => assertProjectMergeAccess(p, { type: 'work' }, 'alice')).toThrow(
    'escopos',
  );
  expect(() =>
    assertProjectMergeAccess(
      p,
      { type: 'personal', createdBy: 'bob' },
      'alice',
    ),
  ).toThrow('Projeto não encontrado.');
  expect(() => assertProjectMergeAccess({}, { type: 'work' }, 'bob')).toThrow(
    'Projeto não encontrado.',
  );
});
