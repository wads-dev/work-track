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
    archivedProjectIds: vi
      .fn<PersonalReportRepository['archivedProjectIds']>()
      .mockResolvedValue([]),
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
    { to: '2027-02-01T00:00:00Z' },
    { timeZone: 'invalid' },
    { cursor: 'users/bob/records/x' },
    { uid: 'bob' },
  ])
    await expect(
      getPersonalReportHandler(repo, { ...input, ...patch }, auth),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(readPage).not.toHaveBeenCalled();
  await getPersonalReportHandler(repo, input, auth);
  expect(readPage).not.toHaveBeenCalled();
  expect(repo.loadContext).toHaveBeenCalledExactlyOnceWith(['alice']);
});
it('accepts a62 civil day range spanning fall DST', async () => {
  const repo = {
    archivedProjectIds: vi
      .fn<PersonalReportRepository['archivedProjectIds']>()
      .mockResolvedValue([]),
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
        from: '2026-10-01T00:00:00-04:00',
        to: '2026-12-02T00:00:00-05:00',
        timeZone: 'America/New_York',
      },
      auth,
    ),
  ).resolves.toMatchObject({ policy: 'personal-v3' });
  const start = Date.parse('2026-08-01T00:00:00Z');
  for (const duration of [
    61 * 86400000,
    62 * 86400000,
    (93 * 24 + 1) * 3600000,
  ]) {
    await expect(
      getPersonalReportHandler(
        repo,
        {
          from: new Date(start).toISOString(),
          to: new Date(start + duration).toISOString(),
          timeZone: 'UTC',
        },
        auth,
      ),
    ).resolves.toMatchObject({ policy: 'personal-v3' });
  }
  const calls = repo.readPage.mock.calls.length;
  await expect(
    getPersonalReportHandler(
      repo,
      {
        from: new Date(start).toISOString(),
        to: new Date(start + (93 * 24 + 1) * 3600000 + 1).toISOString(),
        timeZone: 'UTC',
      },
      auth,
    ),
  ).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(repo.readPage).toHaveBeenCalledTimes(calls);
});
