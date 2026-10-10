import { expect, it } from 'vitest';
import { ClientPersonalReportRepository } from './personal-report-repository.js';
import { ownCalendarRepository } from './own-calendar-repository.js';
import { executeCalendarReport } from '@work-track/core/reports/application/get-calendar-report';
import { calendarInput } from '@work-track/core/reports/application/calendar-input';
it('executes original calendar use case without private/company scans and marks missing directory', async () => {
  const own = new ClientPersonalReportRepository(
    'alice',
    [
      {
        id: 'a',
        uid: 'alice',
        projectId: 'p1',
        startedAt: '2026-10-08T12:00:00Z',
        endedAt: '2026-10-08T13:30:00Z',
        timeZone: 'UTC',
        topics: [],
      },
    ],
    new Map([['p1', { topics: [] }]]),
  );
  const repository = ownCalendarRepository(own, 'alice');
  const input = calendarInput.parse({
    mode: 'own',
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
    timeZone: 'UTC',
  });
  const result = await executeCalendarReport(
    repository,
    input,
    'alice',
    Date.parse('2026-10-09T00:00:00Z'),
  );
  expect(result.totalMinutes).toBe(90);
  expect(result.participantsUnavailable).toBe(true);
  expect(result.page.partial).toBe(false);
  expect(result.intervals).toHaveLength(1);
  await expect(repository.revalidate([], 'bob', 'own')).rejects.toThrow(
    'Visualizador',
  );
  await expect(repository.company.userLabels(['bob'])).rejects.toThrow(
    'não autorizada',
  );
  await expect(
    executeCalendarReport(repository, { ...input, userIds: ['bob'] }, 'alice'),
  ).rejects.toThrow('Modo próprio');
});
