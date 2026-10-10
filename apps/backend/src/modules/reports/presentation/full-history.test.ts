import { expect, it, vi } from 'vitest';
import { getPersonalReportHandler } from './get-personal-report.js';
import { getCompanyReportHandler } from './get-company-report.js';
import type { PersonalReportRepository } from '../domain/personal-report.js';
import type { CompanyReportRepository } from '../domain/company-report.js';
const auth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
const records = [
  {
    id: 'a',
    uid: 'alice',
    projectId: 'other',
    startedAt: '2026-01-01T04:00:00-03:00',
    endedAt: '2026-01-01T10:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
    topics: [],
  },
  {
    id: 'b',
    uid: 'alice',
    projectId: 'chosen',
    startedAt: '2026-01-01T11:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
    topics: [],
  },
];
it('allhistory has no invented bounds, projectfilter preserves open estimates, one-sided dates work', async () => {
  const repo: PersonalReportRepository = {
    readTopics: vi.fn().mockResolvedValue({}),
    loadContext: vi.fn().mockResolvedValue(records),
    readPage: vi.fn(),
    archivedProjectIds: vi.fn().mockResolvedValue([]),
  };
  const now = Date.parse('2026-10-09T00:00:00Z');
  const all = await getPersonalReportHandler(
    repo,
    { timeZone: 'UTC' },
    auth,
    now,
  );
  expect(all.totalMinutes).toBe(720);
  expect(all.from).toBeUndefined();
  expect(all.to).toBeUndefined();
  expect(all.scope).toBe('all-selected');
  const filtered = await getPersonalReportHandler(
    repo,
    { timeZone: 'UTC', projectId: 'chosen' },
    auth,
    now,
  );
  expect(filtered.totalMinutes).toBe(360);
  const from = await getPersonalReportHandler(
    repo,
    { timeZone: 'UTC', from: '2026-02-01T00:00:00Z' },
    auth,
    now,
  );
  expect(from.totalMinutes).toBe(0);
  const to = await getPersonalReportHandler(
    repo,
    { timeZone: 'UTC', to: '2026-01-02T00:00:00Z' },
    auth,
    now,
  );
  expect(to.totalMinutes).toBe(720);
});
it('company aggregates all internal pages and fails rather than partial if cap exceeded', async () => {
  const readPage = vi
    .fn<CompanyReportRepository['readPage']>()
    .mockResolvedValueOnce({
      records: [records[0]!],
      scannedCount: 1,
      nextCursor: 'users/alice/records/a',
    })
    .mockResolvedValueOnce({
      records: [records[1]!],
      scannedCount: 1,
      nextCursor: null,
    });
  const repo = {
    readPage,
    readTopics: vi.fn().mockResolvedValue({}),
    loadContext: vi.fn().mockResolvedValue(records),
    archivedProjectIds: vi.fn().mockResolvedValue([]),
    userLabels: vi.fn().mockResolvedValue({}),
  };
  const report = await getCompanyReportHandler(
    repo,
    { timeZone: 'UTC' },
    auth,
    Date.parse('2026-10-09T00:00:00Z'),
  );
  expect(report.totalMinutes).toBe(720);
  expect(report.page).toMatchObject({
    partial: false,
    nextCursor: null,
    scannedCount: 2,
  });
  expect(readPage).toHaveBeenCalledTimes(2);
  readPage.mockResolvedValue({
    records: Array.from({ length: 2001 }, () => records[0]!),
    scannedCount: 2001,
    nextCursor: null,
  });
  await expect(
    getCompanyReportHandler(repo, { timeZone: 'UTC' }, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
});
