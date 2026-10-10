import { expect, it, vi } from 'vitest';
import { manageTopicsHandler } from './manage-topics.js';
import type { TopicManagementRepository } from '@work-track/core/registration/domain/topic-management';
const auth = {
  uid: 'u',
  token: {
    email: 'u@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
it('guards merge/history, validates explicit confirmation and forwards preview defaults', async () => {
  const mergeTopics = vi.fn<TopicManagementRepository['mergeTopics']>();
  const listTopicMerges = vi.fn<TopicManagementRepository['listTopicMerges']>();
  const repo = { mergeTopics, listTopicMerges };
  const input = { projectId: 'p', sourceTopicIds: ['a'], targetTopicId: 'b' };
  await expect(manageTopicsHandler(repo, 'merge', input)).rejects.toMatchObject(
    { code: 'unauthenticated' },
  );
  await expect(
    manageTopicsHandler(
      repo,
      'history',
      { projectId: 'p' },
      { ...auth, token: { ...auth.token, email: 'x@outside.dev' } },
    ),
  ).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(
    manageTopicsHandler(repo, 'merge', { ...input, confirmed: true }, auth),
  ).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mergeTopics).not.toHaveBeenCalled();
  expect(listTopicMerges).not.toHaveBeenCalled();
  await manageTopicsHandler(repo, 'merge', input, auth);
  expect(mergeTopics).toHaveBeenCalledExactlyOnceWith(
    { ...input, confirmed: false },
    'u',
  );
  await manageTopicsHandler(repo, 'history', { projectId: 'p' }, auth);
  expect(listTopicMerges).toHaveBeenCalledExactlyOnceWith(
    {
      projectId: 'p',
      limit: 20,
    },
    'u',
  );
});
