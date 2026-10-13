import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreWorkRepository } from '../infrastructure/firestore-work.js';
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
  { id: 'd', type: 'work', createdBy: 'bob', title: 'Shared Bob' },
  { id: 'e', type: 'invalid', title: 'Deny malformed' },
  { id: 'f', createdBy: 'alice', title: 'Deny missing type' },
].map((p) => ({
  ...p,
  description: 'Synthetic project description',
  topics: [],
  createdAt: '2026-10-01T00:00:00Z',
})) as Project[];
it('filters server authorized projects before pagination and rejects hidden or absent cursors identically', async () => {
  const query = (rows: Project[]) => ({
    where: (
      field: string,
      operator: string,
      value: string | string[],
    ): unknown =>
      query(
        rows.filter((row) => {
          const actual = (row as unknown as Record<string, unknown>)[field];
          return operator === 'in'
            ? (value as string[]).includes(actual as string)
            : actual === value;
        }),
      ),
    orderBy: (): unknown =>
      query([...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))),
    startAfter: (id: string): unknown =>
      query(rows.filter((row) => row.id > id)),
    limit: (limit: number) => ({
      get: () =>
        Promise.resolve({
          docs: rows
            .slice(0, limit)
            .map((row) => ({ id: row.id, data: () => row })),
        }),
    }),
    doc: (id: string) => ({
      get: () =>
        Promise.resolve({
          exists: rows.some((row) => row.id === id),
          id,
          data: () => rows.find((row) => row.id === id),
        }),
    }),
  });
  const repo = new FirestoreWorkRepository({
    collection: () => query(catalog),
  } as unknown as Firestore);
  const listProjectsPage = vi.spyOn(repo, 'listProjectsPage');
  await expect(listProjectsHandler(repo, {})).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  expect(listProjectsPage).not.toHaveBeenCalled();
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
        {
          listProjectsPage: () =>
            Promise.resolve({ projects: [], nextCursor: null }),
        },
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
  for (const cursor of ['b', 'f', 'missing'])
    await expect(
      listProjectsHandler(repo, { cursor }, auth('alice')),
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Cursor inválido.',
    });
  expect(listProjectsPage).toHaveBeenCalledWith('bob', {
    scope: 'personal',
    includeArchived: false,
    limit: 50,
  });
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
  expect(listProjects).toHaveBeenCalledExactlyOnceWith('alice', {
    query: '',
    limit: 10,
    includeArchived: false,
  });
});
