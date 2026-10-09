import { expect, it } from 'vitest';
import { executePersonalReport } from '../../backend/src/modules/reports/application/get-personal-report';
import type { PersonalReportRepository } from '../../backend/src/modules/reports/domain/personal-report';
it('executes the existing personal use case with a client repository and unchanged factual totals', async () => {
  const records = [
    {
      id: 'r1',
      uid: 'alice',
      projectId: 'p1',
      startedAt: '2026-10-08T12:00:00Z',
      endedAt: '2026-10-08T13:30:00Z',
      timeZone: 'UTC',
      topics: [],
    },
  ];
  const repository: PersonalReportRepository = {
    loadContext: async (uids) => {
      expect(uids).toEqual(['alice']);
      return records;
    },
    readPage: async () => {
      throw new Error('Unnecessary paging of complete client snapshot');
    },
    archivedProjectIds: async () => [],
    readTopics: async () => ({ p1: [] }),
  };
  const report = await executePersonalReport(
    repository,
    {
      from: '2026-10-08T00:00:00Z',
      to: '2026-10-09T00:00:00Z',
      timeZone: 'UTC',
    },
    'alice',
    Date.parse('2026-10-09T00:00:00Z'),
  );
  expect(report.totalMinutes).toBe(90);
  expect(report.policy).toBe('personal-v3');
  expect(report.page.partial).toBe(false);
  expect(report.byProject).toEqual([{ projectId: 'p1', minutes: 90 }]);
});
