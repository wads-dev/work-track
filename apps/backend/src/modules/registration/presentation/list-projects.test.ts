import { expect, it, vi } from 'vitest';
import { listProjectsHandler } from './list-projects.js';
import type {
  Project,
  WorkRepository,
} from '@work-track/core/registration/domain/work-model';
import { RegistrationService } from '@work-track/core/registration/application/registration-service';
import { projectInput } from '@work-track/core/registration/domain/work-model';
const auth = (uid: string) => ({
  uid,
  token: {
    email: uid + '@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
});
const catalog = [
  { id: 'a', type: 'personal', createdBy: 'alice', title: 'Private Alice' },
  { id: 'b', type: 'personal', createdBy: 'bob', title: 'Private Bob' },
  { id: 'c', type: 'work', createdBy: 'alice', title: 'Shared' },
  { id: 'd', createdBy: 'bob', title: 'Legacy' },
  { id: 'e', type: 'invalid', title: 'Deny malformed' },
].map((p) => ({
  ...p,
  description: 'Synthetic project description',
  topics: [],
  createdAt: '2026-10-01T00:00:00Z',
})) as Project[];
it('filters server authorized projects before pagination and rejects hidden or absent cursors identically', async () => {
  const listProjects = vi
    .fn<WorkRepository['listProjects']>()
    .mockResolvedValue(catalog);
  const repo = { listProjects };
  await expect(listProjectsHandler(repo, {})).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  expect(listProjects).not.toHaveBeenCalled();
  const first = await listProjectsHandler(repo, { limit: 1 }, auth('alice'));
  expect(first.projects.map((p) => p.id)).toEqual(['a']);
  expect(first.nextCursor).toBe('a');
  const next = await listProjectsHandler(
    repo,
    { cursor: 'a', limit: 100 },
    auth('alice'),
  );
  expect(next.projects.map((p) => p.id)).toEqual(['c', 'd']);
  expect(next.nextCursor).toBeNull();
  expect(
    (
      await listProjectsHandler(
        { listProjects: () => Promise.resolve([]) },
        {},
        auth('alice'),
      )
    ).nextCursor,
  ).toBeNull();
  expect(
    (
      await listProjectsHandler(repo, { scope: 'personal' }, auth('bob'))
    ).projects.map((p) => p.id),
  ).toEqual(['b']);
  for (const cursor of ['b', 'missing'])
    await expect(
      listProjectsHandler(repo, { cursor }, auth('alice')),
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Cursor inválido.',
    });
  expect(listProjects).toHaveBeenCalledWith('bob');
});
it('requires explicit human personal/work scope, does not accept owner from client', () => {
  const input = {
    title: 'Project',
    description: 'Synthetic project description',
  };
  expect(projectInput.safeParse(input).success).toBe(false);
  expect(
    projectInput.parse({ ...input, type: 'personal', createdBy: 'other' }),
  ).not.toHaveProperty('createdBy');
  expect(projectInput.parse({ ...input, type: 'work' }).type).toBe('work');
});
it('MCP search carries authenticated UID to repository discovery', async () => {
  const listProjects = vi
    .fn<WorkRepository['listProjects']>()
    .mockResolvedValue([]);
  const service = new RegistrationService({
    listProjects,
  } as unknown as WorkRepository);
  await service.search('', 10, 'alice');
  expect(listProjects).toHaveBeenCalledExactlyOnceWith('alice');
});
