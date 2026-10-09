import { expect, it, vi } from 'vitest';
import { getCompanyReportHandler } from './get-company-report.js';
import type { CompanyReportRepository } from '../domain/company-report.js';
const auth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
const input = {
  from: '2026-10-08T00:00:00-03:00',
  to: '2026-10-09T00:00:00-03:00',
  timeZone: 'America/Sao_Paulo',
};
const make = (
  id: string,
  uid: string,
  projectId: string,
  start: number,
  end?: number,
) => ({
  id,
  uid,
  projectId,
  startedAt: '2026-10-08T' + String(start).padStart(2, '0') + ':00:00-03:00',
  ...(end === undefined
    ? {}
    : {
        endedAt: '2026-10-08T' + String(end).padStart(2, '0') + ':00:00-03:00',
      }),
  timeZone: 'America/Sao_Paulo',
  topics: [],
});
it('aggregates multipleUIDs but keeps global budgets and archived facts, no transcript/email', async () => {
  const selected = [
      make('same', 'alice', 'active', 11),
      make('same', 'bob', 'active', 11),
    ],
    context = [...selected, make('closed', 'alice', 'archived', 4, 10)];
  const repo = {
    readPage: vi.fn<CompanyReportRepository['readPage']>().mockResolvedValue({
      records: selected,
      scannedCount: 2,
      nextCursor: null,
    }),
    readTopics: vi.fn().mockResolvedValue({}),
    loadContext: vi.fn().mockResolvedValue(context),
    userLabels: vi.fn().mockResolvedValue({ alice: 'Alice', bob: 'Bob' }),
    archivedProjectIds: vi.fn().mockResolvedValue(['archived']),
  };
  const result = await getCompanyReportHandler(
    repo,
    input,
    auth,
    Date.parse(input.to),
  );
  expect(result.totalMinutes).toBe(360);
  expect(result.byUser).toEqual([
    { uid: 'alice', label: 'Alice', minutes: 120 },
    { uid: 'bob', label: 'Bob', minutes: 240 },
  ]);
  expect(result.byProject).toEqual([{ projectId: 'active', minutes: 360 }]);
  expect(result.page.partial).toBe(false);
  expect(result.scope).toBe('all-selected');
  expect(result.policy).toBe('company-v3');
  expect(result.intervals.map((r) => r.uid)).toEqual(['alice', 'bob']);
  expect(JSON.stringify(result)).not.toContain('@');
});
it('rejects invalid auth/range/cursor before read and fails excessiveUID context', async () => {
  const repo = {
    readPage: vi
      .fn<CompanyReportRepository['readPage']>()
      .mockResolvedValue({ records: [], scannedCount: 0, nextCursor: null }),
    readTopics: vi.fn().mockResolvedValue({}),
    loadContext: vi.fn().mockResolvedValue([]),
    userLabels: vi.fn().mockResolvedValue({}),
    archivedProjectIds: vi.fn().mockResolvedValue([]),
  };
  await expect(getCompanyReportHandler(repo, input)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  for (const patch of [
    { limit: 101 },
    { cursor: 'oauth_tokens/x' },
    { to: '2027-05-01T00:00:00Z' },
    { uid: 'other' },
  ])
    await expect(
      getCompanyReportHandler(repo, { ...input, ...patch }, auth),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(repo.readPage).not.toHaveBeenCalled();
  vi.mocked(repo.readPage).mockResolvedValue({
    records: Array.from({ length: 11 }, (_, i) =>
      make(String(i), String(i), 'active', 11),
    ),
    scannedCount: 11,
    nextCursor: null,
  });
  await expect(
    getCompanyReportHandler(repo, input, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
  expect(repo.loadContext).not.toHaveBeenCalled();
});
