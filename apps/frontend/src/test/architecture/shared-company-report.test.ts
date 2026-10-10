import { expect, it, vi } from 'vitest';
import { executeCompanyReport } from '@work-track/core/reports/application/get-company-report';
import type { CompanyReportRepository } from '@work-track/core/reports/domain/company-report';
it('runs the existing company use case in the client with full context and topic catalog', async () => {
  const record = {
    id: 'r1',
    uid: 'alice',
    projectId: 'p1',
    startedAt: '2026-10-08T12:00:00Z',
    endedAt: '2026-10-08T13:30:00Z',
    timeZone: 'UTC',
    topics: [],
  };
  const repository: CompanyReportRepository = {
    readPage: vi.fn(async () => ({
      records: [record],
      scannedCount: 1,
      nextCursor: null,
    })),
    loadContext: vi.fn(async () => [record]),
    archivedProjectIds: vi.fn(async () => []),
    userLabels: vi.fn(async () => ({ alice: 'Alice' })),
    readTopics: vi.fn(async () => ({ p1: [] })),
  };
  const report = await executeCompanyReport(
    repository,
    { timeZone: 'UTC' },
    Date.parse('2026-10-09T00:00:00Z'),
  );
  expect(report.policy).toBe('company-v3');
  expect(report.totalMinutes).toBe(90);
  expect(report.page.partial).toBe(false);
  expect(repository.loadContext).toHaveBeenCalledWith(['alice']);
  expect(report.byUser).toEqual([
    { uid: 'alice', label: 'Alice', minutes: 90 },
  ]);
  expect(repository.readTopics).toHaveBeenCalledWith(['p1']);
});
