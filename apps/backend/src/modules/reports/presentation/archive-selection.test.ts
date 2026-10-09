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
it('active selection excludes archive totals but archived closed facts still spend global budget', async () => {
  const closed = {
    id: 'closed',
    uid: 'alice',
    projectId: 'archived',
    startedAt: '2026-10-08T04:00:00-03:00',
    endedAt: '2026-10-08T10:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
    topics: [],
  };
  const open = {
    id: 'open',
    uid: 'alice',
    projectId: 'active',
    startedAt: '2026-10-08T11:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
    topics: [],
  };
  const repo: PersonalReportRepository = {
    readPage: vi.fn().mockResolvedValue({
      records: [closed, open],
      scannedCount: 2,
      nextCursor: null,
    }),
    readTopics: vi.fn().mockResolvedValue({}),
    loadContext: vi.fn().mockResolvedValue([closed, open]),
    archivedProjectIds: vi.fn().mockResolvedValue(['archived']),
  };
  const input = {
    from: '2026-10-08T00:00:00-03:00',
    to: '2026-10-09T00:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
  };
  const active = await getPersonalReportHandler(
    repo,
    input,
    auth,
    Date.parse(input.to),
  );
  expect(active.totalMinutes).toBe(120);
  expect(active.byProject).toEqual([{ projectId: 'active', minutes: 120 }]);
  const all = await getPersonalReportHandler(
    repo,
    { ...input, includeArchived: true },
    auth,
    Date.parse(input.to),
  );
  expect(all.totalMinutes).toBe(480);
  expect(all.intervals).toHaveLength(2);
});
