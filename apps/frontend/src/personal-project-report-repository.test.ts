import { expect, it } from 'vitest';
import { ClientPersonalReportRepository } from './personal-report-repository';
import { personalProjectReportRepository } from './personal-project-report-repository';
import { getProjectReport } from '../../backend/src/modules/reports/application/get-project-report';
it('reuses the project use case with full personal budget context before selecting project', async () => {
  const own = new ClientPersonalReportRepository(
    'alice',
    [
      {
        id: 'a',
        uid: 'alice',
        projectId: 'work',
        startedAt: '2026-10-08T11:00:00Z',
        endedAt: '2026-10-08T18:00:00Z',
        timeZone: 'UTC',
        topics: [],
      },
      {
        id: 'b',
        uid: 'alice',
        projectId: 'personal',
        startedAt: '2026-10-08T18:00:00Z',
        timeZone: 'UTC',
        topics: [],
      },
    ],
    new Map([
      ['work', { topics: [] }],
      ['personal', { type: 'personal', createdBy: 'alice', topics: [] }],
    ]),
  );
  const repo = personalProjectReportRepository(own, 'alice');
  const report = await getProjectReport(
    repo,
    { projectId: 'personal' },
    Date.parse('2026-10-08T22:00:00Z'),
    'alice',
  );
  expect(report.totalMinutes).toBe(60);
  expect(report.records).toHaveLength(1);
  expect(report.page.partial).toBe(false);
  await expect(
    repo.readPage('personal', 100, undefined, 'bob'),
  ).rejects.toThrow('não autorizado');
  expect(await repo.readPage('work', 100, undefined, 'alice')).toBeNull();
  await expect(repo.loadContext(['bob'], 'alice')).rejects.toThrow(
    'não autorizado',
  );
});
it('keeps empty personal projects reportable without company queries', async () => {
  const own = new ClientPersonalReportRepository(
    'alice',
    [],
    new Map([['p', { type: 'personal', createdBy: 'alice', topics: [] }]]),
  );
  const report = await getProjectReport(
    personalProjectReportRepository(own, 'alice'),
    { projectId: 'p' },
    Date.now(),
    'alice',
  );
  expect(report.totalMinutes).toBe(0);
  expect(report.records).toEqual([]);
});
