import { it, expect } from 'vitest';
import { globalEstimates, recordKey } from './global-estimates.js';
import { buildProjectReport } from './build-project-report.js';
import { buildPersonalReport } from './build-personal-report.js';
import { buildCompanyReport } from './build-company-report.js';
import { buildDailyHours } from '../../daily-hours/domain/daily-hours.js';
import { buildTopicBreakdown } from './topic-breakdown.js';
import { isDeletedRecord } from '../../registration/domain/record-lifecycle.js';
import type { ReportSourceRecord } from './project-report.js';
const start = '2026-10-08T09:00:00-03:00',
  now = Date.parse('2026-10-09T00:00:00-03:00');
const open: ReportSourceRecord = {
  id: 'open',
  uid: 'alice',
  projectId: 'p',
  startedAt: start,
  timeZone: 'America/Sao_Paulo',
  topics: [],
};
const input = { timeZone: 'America/Sao_Paulo', includeArchived: true };
it.each(['now', 0, false, {}, []])(
  'rejects deleted marker %j before all root calculations next cut estimates and topic allocation',
  (deletedAt) => {
    const deleted = [
      {
        ...open,
        id: 'next',
        startedAt: '2026-10-08T10:00:00-03:00',
        deletedAt,
      },
      {
        ...open,
        id: 'closed',
        projectId: 'other',
        startedAt: '2026-10-08T00:00:00-03:00',
        endedAt: '2026-10-08T08:00:00-03:00',
        deletedAt,
      },
      { ...open, id: 'tiny', endedAt: '2026-10-08T09:01:00-03:00', deletedAt },
      { ...open, id: 'invalid', startedAt: 'bad', timeZone: 'bad', deletedAt },
    ];
    const records = [open, ...deleted];
    expect(deleted.every(isDeletedRecord)).toBe(true);
    const global = globalEstimates(records, now);
    expect(global.ends.size).toBe(1);
    expect(global.ends.get(recordKey(open))).toBe(
      Date.parse('2026-10-08T15:00:00-03:00'),
    );
    const personal = buildPersonalReport(
      input,
      { records, scannedCount: 1, nextCursor: null },
      now,
      records,
    );
    expect(personal.totalMinutes).toBe(360);
    expect(personal.intervals.map((r) => r.id)).toEqual(['open']);
    const project = buildProjectReport(
      'p',
      { records, nextCursor: null, topicLabels: {} },
      100,
      now,
      {},
      false,
      records,
    );
    expect(project.totalMinutes).toBe(360);
    expect(project.records.map((r) => r.id)).toEqual(['open']);
    const company = buildCompanyReport(
      input,
      { records, scannedCount: 1, nextCursor: null },
      records,
      now,
      {},
      [],
    );
    expect(company.totalMinutes).toBe(360);
    expect(company.intervals.map((r) => r.id)).toEqual(['open']);
    const daily = buildDailyHours(
      {
        date: '2026-10-08',
        timeZone: 'America/Sao_Paulo',
        includeArchived: true,
      },
      {
        records,
        projects: new Map([
          ['p', { type: 'work' }],
          ['other', { type: 'work' }],
        ]),
      },
      'alice',
      now,
    );
    expect(daily.totalMinutes).toBe(360);
    const breakdown = buildTopicBreakdown(
      records,
      deleted.map((r) => ({ ...r, minutes: 60 })),
      new Map(),
    );
    expect(breakdown.byTopic).toEqual([]);
    expect(breakdown.unassignedMinutes).toBe(0);
  },
);
it.each([undefined, null])('legacy marker %s remains active', (deletedAt) =>
  expect(isDeletedRecord({ ...open, deletedAt })).toBe(false),
);
