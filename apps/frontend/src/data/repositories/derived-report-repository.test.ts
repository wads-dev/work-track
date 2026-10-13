import { expect, it } from 'vitest';
import {
  selectCalendarHistoryPage,
  selectTopicReportBuckets,
  topicBucketKey,
  topicBuckets,
  type ReportTopic,
} from './derived-report-repository';
const topic: ReportTopic = {
  projectId: 'p',
  topicId: 't',
  label: 'Secret topic',
  minutes: 180,
  byUser: [
    { uid: 'me', label: 'My identity', minutes: 120 },
    { uid: 'other', label: 'Other identity', minutes: 60 },
  ],
};
it('keeps person UID, name, counts and totals in both privacy modes while masking only project/topic metadata', () => {
  const metadata = () => ({ title: 'Secret project', confidential: true });
  const hidden = topicBuckets([topic], metadata, false)[0];
  const revealed = topicBuckets([topic], metadata, true)[0];
  expect(hidden.projectLabel).toBe('Projeto reservado');
  expect(hidden.topicLabel).toBe('Tópico reservado');
  expect(hidden.detailsAvailable).toBe(false);
  expect(hidden.people).toEqual(revealed.people);
  expect(hidden.people.map((person) => person.uid)).toEqual(['me', 'other']);
  expect(hidden.people.map((person) => person.label)).toEqual([
    'My identity',
    'Other identity',
  ]);
  expect(hidden.minutes).toBe(revealed.minutes);
  expect(JSON.stringify(hidden)).not.toContain('Secret');
});
it('defensively validates personal byUser and never synthesizes or recalculates topic allocation totals', () => {
  for (const revealed of [false, true]) {
    const selected = topicBuckets(
      [topic],
      () => ({ title: 'Project' }),
      revealed,
      'me',
    );
    expect(selected[0].people).toEqual([
      { key: '0', uid: 'me', label: 'Você', minutes: 120 },
    ]);
    expect(selected[0].minutes).toBe(180);
    expect(JSON.stringify(selected)).not.toContain('other');
    expect(
      topicBuckets([topic], () => ({ title: 'Project' }), revealed, 'absent')[0]
        .people,
    ).toEqual([]);
  }
  expect(
    topicBuckets([topic], () => ({ title: 'Project' }), false, '')[0].people,
  ).toEqual([]);
  expect(topic.byUser).toHaveLength(2);
});
it('selects computed topic buckets by project-qualified identity without mutating full allocations', () => {
  const buckets = topicBuckets(
    [topic, { ...topic, projectId: 'q', minutes: 90 }],
    (id) => ({ title: id }),
    true,
  );
  const result = selectTopicReportBuckets(buckets, topicBucketKey(buckets[1]));
  expect(result.active).toBe(buckets[1]);
  expect(result.visibleBuckets).toEqual([buckets[1]]);
  expect(buckets.map((bucket) => bucket.minutes)).toEqual([180, 90]);
  expect(selectTopicReportBuckets(buckets, 'invalid').visibleBuckets).toBe(
    buckets,
  );
  expect(selectTopicReportBuckets(buckets, '').active).toBeUndefined();
});
it('paginates occupied history in four-week windows while retaining complete report totals and full-context estimates', () => {
  const weeks = Array.from({ length: 9 }, (_, index) =>
    new Date(Date.UTC(2026, 0, 5 + index * 7)).toISOString().slice(0, 10),
  );
  const report = {
    totalMinutes: 960,
    closedMinutes: 600,
    estimatedMinutes: 360,
    occupiedWeeks: weeks,
    occurrencesByWeek: weeks.map((week, index) => ({
      week,
      occurrenceCount: index + 1,
    })),
    intervals: [
      {
        id: 'spans-all-weeks',
        effectiveStartedAt: '2026-01-05T00:00:00Z',
        effectiveEndedAt: '2026-03-09T00:00:00Z',
        estimated: false,
      },
      {
        id: 'open-estimated-with-full-context',
        effectiveStartedAt: '2026-03-02T08:00:00Z',
        effectiveEndedAt: '2026-03-02T14:00:00Z',
        estimated: true,
      },
    ],
  };
  const before = structuredClone(report);
  const first = selectCalendarHistoryPage(
    report.occupiedWeeks,
    report.occurrencesByWeek,
    0,
  );
  const second = selectCalendarHistoryPage(
    report.occupiedWeeks,
    report.occurrencesByWeek,
    1,
  );
  const last = selectCalendarHistoryPage(
    report.occupiedWeeks,
    report.occurrencesByWeek,
    99,
  );
  expect(first.weeks.map((row) => row.week)).toEqual(weeks.slice(0, 4));
  expect(second.weeks.map((row) => row.week)).toEqual(weeks.slice(4, 8));
  expect(last).toMatchObject({
    page: 2,
    pages: 3,
    totalWeeks: 9,
    weeks: [{ week: weeks[8], occurrenceCount: 9 }],
  });
  expect(report).toEqual(before);
  expect(report.estimatedMinutes).toBe(360);
  expect(report.intervals).toHaveLength(2);
});
it('normalizes invalid page values, empty history and missing occurrence counts', () => {
  for (const value of [NaN, Infinity, -1, 0.5]) {
    expect(selectCalendarHistoryPage(['2026-01-05'], [], value)).toEqual({
      page: 0,
      pages: 1,
      totalWeeks: 1,
      weeks: [{ week: '2026-01-05', occurrenceCount: 0 }],
    });
  }
  expect(selectCalendarHistoryPage([], [], 4)).toEqual({
    page: 0,
    pages: 1,
    totalWeeks: 0,
    weeks: [],
  });
});
