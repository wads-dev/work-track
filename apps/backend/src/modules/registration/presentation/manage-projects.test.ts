import { expect, it, vi } from 'vitest';
import { manageProjectHandler } from './manage-projects.js';
import type { ProjectManagementRepository } from '../domain/project-management.js';
it('guards callables and requires explicit merge confirmation inputs', async () => {
  const updateProject = vi.fn<ProjectManagementRepository['updateProject']>(),
    mergeProjects = vi.fn<ProjectManagementRepository['mergeProjects']>();
  const repository = {
    updateProject,
    mergeProjects,
    archiveProject: vi.fn<ProjectManagementRepository['archiveProject']>(),
  };
  await expect(
    manageProjectHandler(repository, 'merge', {
      sourceProjectId: 'a',
      targetProjectId: 'b',
    }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  const auth = {
    uid: 'alice',
    token: {
      email: 'alice@wads.dev',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    },
  };
  await expect(
    manageProjectHandler(
      repository,
      'merge',
      { sourceProjectId: 'a', targetProjectId: 'b', confirmed: true },
      auth,
    ),
  ).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mergeProjects).not.toHaveBeenCalled();
  await manageProjectHandler(
    repository,
    'merge',
    { sourceProjectId: 'a', targetProjectId: 'b' },
    auth,
  );
  expect(mergeProjects).toHaveBeenCalledExactlyOnceWith(
    { sourceProjectId: 'a', targetProjectId: 'b', confirmed: false },
    'alice',
  );
});
