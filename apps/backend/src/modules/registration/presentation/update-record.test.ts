import { expect, it, vi } from 'vitest';
import { updateRecordHandler } from './update-record.js';
import type { RecordEditingRepository } from '@work-track/core/registration/domain/record-edit';
const auth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
it('authorizes before writes and always uses authenticated UID', async () => {
  const updateRecord = vi.fn<RecordEditingRepository['updateRecord']>();
  const repository = {
    updateRecord,
    listOpenRecords: vi.fn<RecordEditingRepository['listOpenRecords']>(),
  };
  await expect(
    updateRecordHandler(repository, {
      recordId: 'record',
      endedAt: null,
      reason: 'reabrir',
    }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  await expect(
    updateRecordHandler(
      repository,
      { recordId: 'record', endedAt: null, reason: 'reabrir' },
      { ...auth, token: { ...auth.token, email: 'other@gmail.com' } },
    ),
  ).rejects.toMatchObject({ code: 'permission-denied' });
  expect(updateRecord).not.toHaveBeenCalled();
  await updateRecordHandler(
    repository,
    { recordId: 'record', endedAt: null, reason: 'reabrir' },
    auth,
  );
  expect(updateRecord).toHaveBeenCalledExactlyOnceWith(
    { recordId: 'record', endedAt: null, reason: 'reabrir' },
    'alice',
  );
});
