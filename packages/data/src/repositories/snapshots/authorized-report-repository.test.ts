import { expect, it } from 'vitest';
import {
  AuthorizedReportRepository,
  recordKey,
} from './authorized-report-repository.js';
import { executeCompanyReport } from '@work-track/core/reports/application/get-company-report';
import { executeCalendarReport } from '@work-track/core/reports/application/get-calendar-report';
import { getProjectReport } from '@work-track/core/reports/application/get-project-report';
const projects = new Map([
  ['a', { type: 'work', topics: [] }],
  ['b', { type: 'work', topics: [] }],
  ['private', { type: 'personal', createdBy: 'other', topics: [] }],
]);
const r = (
  id: string,
  uid: string,
  projectId: string,
  start: string,
  end?: string,
) => ({
  id,
  uid,
  projectId,
  startedAt: start,
  endedAt: end,
  timeZone: 'UTC',
  topics: [],
});
const rows = [
  r('same', 'alice', 'a', '2026-10-08T12:00:00Z', '2026-10-08T18:00:00Z'),
  r('second', 'alice', 'b', '2026-10-08T18:00:00Z'),
  r('same', 'bob', 'a', '2026-10-08T12:00:00Z', '2026-10-08T13:00:00Z'),
  r(
    'hidden',
    'alice',
    'private',
    '2026-10-08T08:00:00Z',
    '2026-10-08T12:00:00Z',
  ),
  r(
    'orphan',
    'alice',
    'absent',
    '2026-10-08T08:00:00Z',
    '2026-10-08T12:00:00Z',
  ),
];
it('uses complete work-only cross-project context and shared company budget', async () => {
  const repo = new AuthorizedReportRepository('viewer', rows, projects);
  const report = await executeCompanyReport(
    repo,
    { timeZone: 'UTC', projectId: 'b' },
    Date.parse('2026-10-09T00:00:00Z'),
  );
  expect(report.totalMinutes).toBe(360);
  expect((await repo.loadContext(['alice'])).map((x) => x.projectId)).toEqual([
    'a',
    'b',
  ]);
  expect(report.byUser[0]!.label).toBe('alice');
});
it('keeps identical record IDs from different authors in the selected company page', async () => {
  const repo = new AuthorizedReportRepository('viewer', rows, projects);
  expect((await repo.readPage(100, undefined, 'a')).records).toHaveLength(2);
  expect(recordKey(rows[0]!)).not.toBe(recordKey(rows[2]!));
});
it('executes real global calendar selection with separate complete context and UID directory', async () => {
  const repo = new AuthorizedReportRepository(
    'viewer',
    rows,
    projects,
    new Set([recordKey(rows[1]!)]),
  );
  const report = await executeCalendarReport(
    repo.calendar(),
    {
      mode: 'global',
      projectId: 'b',
      from: '2026-10-08T00:00:00Z',
      to: '2026-10-09T00:00:00Z',
      timeZone: 'UTC',
      includeArchived: false,
      allWeeks: false,
    },
    'viewer',
    Date.parse('2026-10-09T00:00:00Z'),
  );
  expect(report.totalMinutes).toBe(360);
  expect(report.participants).toEqual([{ uid: 'alice', label: 'alice' }]);
});
it('executes real project use case without callable for arbitrary authorized authors', async () => {
  const repo = new AuthorizedReportRepository('viewer', rows, projects);
  const report = await getProjectReport(
    repo.project(),
    { projectId: 'a', includeArchived: false },
    Date.parse('2026-10-09T00:00:00Z'),
    'viewer',
  );
  expect(report.totalMinutes).toBe(420);
  expect(report.byUser).toHaveLength(2);
});
it('filters revoked foreign personal parents and rejects mismatched viewer', async () => {
  const repo = new AuthorizedReportRepository(
    'viewer',
    rows,
    new Map([['a', { type: 'personal', createdBy: 'other', topics: [] }]]),
  );
  expect(await repo.loadContext(['alice', 'bob'])).toEqual([]);
  expect(
    await repo.project().readPage('a', 100, undefined, 'viewer'),
  ).toBeNull();
  await expect(
    repo.calendar().revalidate(rows, 'other', 'global'),
  ).rejects.toThrow('Visualizador');
});
