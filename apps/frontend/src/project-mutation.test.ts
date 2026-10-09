import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Functions } from 'firebase/functions';
const mocks = vi.hoisted(() => ({ call: vi.fn(), invalidate: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.call }));
vi.mock('./project-repository', () => ({
  projectRepository: { invalidate: mocks.invalidate },
}));
import { projectMutation } from './project-mutation';
describe('project mutation invalidation', () => {
  beforeEach(() => {
    mocks.call.mockReset();
    mocks.invalidate.mockReset();
  });
  it('does not invalidate a read-only preview', async () => {
    mocks.call.mockResolvedValue({ data: { preview: true } });
    await projectMutation(
      {} as Functions,
      'mergeProjects',
    )({ confirmed: false });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('invalidates exactly once after a confirmed successful mutation', async () => {
    mocks.call.mockResolvedValue({ data: { ok: true } });
    await projectMutation({} as Functions, 'mergeTopics')({ confirmed: true });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
  it('invalidates after mutation failure without swallowing the error', async () => {
    mocks.call.mockRejectedValue(Error('denied'));
    await expect(
      projectMutation({} as Functions, 'updateProject')({ title: 'new' }),
    ).rejects.toThrow('denied');
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
});
