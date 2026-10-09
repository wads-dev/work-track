import { expect, it, vi } from 'vitest';
import { getPersonalReportHandler } from './get-personal-report.js';
import type { PersonalReportRepository } from '../domain/personal-report.js';
const auth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
it('only reads authenticated own records and validates bounds/auth/cursor', async () => {
  const readPage = vi
    .fn<PersonalReportRepository['readPage']>()
    .mockResolvedValue({ records: [], scannedCount: 0, nextCursor: null });
  const repo = {
    readPage,
    loadContext: vi
      .fn<PersonalReportRepository['loadContext']>()
      .mockResolvedValue([]),
  };
  const input = {
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
    timeZone: 'UTC',
  };
  await expect(getPersonalReportHandler(repo, input)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  for (const patch of [
    { to: '2026-12-01T00:00:00Z' },
    { timeZone: 'invalid' },
    { cursor: 'users/bob/records/x' },
    { uid: 'bob' },
  ])
    await expect(
      getPersonalReportHandler(repo, { ...input, ...patch }, auth),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(readPage).not.toHaveBeenCalled();
  await getPersonalReportHandler(repo, input, auth);
  expect(readPage).toHaveBeenCalledExactlyOnceWith('alice', 200, undefined);
});
it('accepts a31 civil day range spanning fall DST', async () => {
  const repo = {
    loadContext: vi
      .fn<PersonalReportRepository['loadContext']>()
      .mockResolvedValue([]),
    readPage: vi
      .fn<PersonalReportRepository['readPage']>()
      .mockResolvedValue({ records: [], scannedCount: 0, nextCursor: null }),
  };
  await expect(
    getPersonalReportHandler(
      repo,
      {
        from: '2026-10-15T00:00:00-04:00',
        to: '2026-11-15T00:00:00-05:00',
        timeZone: 'America/New_York',
      },
      auth,
    ),
  ).resolves.toMatchObject({ policy: 'personal-v2' });
});
