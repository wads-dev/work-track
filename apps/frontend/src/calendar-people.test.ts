import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  calendarPerson,
  calendarRequest,
  updateCalendarPerson,
  calendarReport,
  type CalendarResponse,
} from './calendar-people';
const data: CalendarResponse = {
  policy: 'calendar-v3',
  mode: 'own',
  viewerUid: 'me',
  scope: 'all-selected',
  asOf: '2026-10-09T12:00:00Z',
  from: '2026-10-09T00:00:00Z',
  to: '2026-10-10T00:00:00Z',
  timeZone: 'America/Sao_Paulo',
  totalMinutes: 60,
  estimatedCount: 0,
  participants: [{ uid: 'me', label: 'Eu' }],
  byUser: [],
  intervals: [
    {
      id: 'record',
      uid: 'me',
      projectId: 'project',
      startedAt: '2026-10-09T09:00:00Z',
      effectiveStartedAt: '2026-10-09T09:00:00Z',
      effectiveEndedAt: '2026-10-09T10:00:00Z',
      estimated: false,
      minutes: 60,
      readOnly: false,
    },
  ],
  warnings: [],
  page: {
    limit: 2000,
    scannedCount: 1,
    excludedCount: 0,
    nextCursor: null,
    partial: false,
  },
};
describe('calendar people default and safe scope', () => {
  it('omits optional project and all-mode userIds at SDK boundary, never encodes undefined to null', () => {
    const own = calendarRequest(
      new URLSearchParams(),
      'me',
      'from',
      'to',
      'America/Sao_Paulo',
      false,
    );
    expect(Object.hasOwn(own, 'projectId')).toBe(false);
    expect(own.userIds).toEqual(['me']);
    const all = calendarRequest(
      new URLSearchParams('uid=all&projectId=project'),
      'me',
      'from',
      'to',
      'America/Sao_Paulo',
      true,
    );
    expect(all.projectId).toBe('project');
    expect(Object.hasOwn(all, 'userIds')).toBe(false);
    expect(Object.values(own).some((v) => v === undefined || v === null)).toBe(
      false,
    );
  });
  it('empty URL and current UID are own only', () => {
    expect(calendarPerson(new URLSearchParams(), 'me')).toEqual({
      selected: 'me',
      mode: 'own',
      userIds: ['me'],
    });
    expect(calendarPerson(new URLSearchParams('uid=me'), 'me').mode).toBe(
      'own',
    );
  });
  it('discovery needs explicit choice and only requests viewer global intervals', () => {
    expect(calendarPerson(new URLSearchParams('uid=all'), 'me')).toEqual({
      selected: 'all',
      mode: 'global',
    });
    expect(
      calendarPerson(new URLSearchParams('uid=other'), 'me').userIds,
    ).toEqual(['other']);
  });
  it('person URL changes preserve project period independently and close drawer/cursor', () => {
    const p = new URLSearchParams(
      'date=2026-10-09&projectId=project&record=rec&recordTab=edit&cursor=stale',
    );
    const next = updateCalendarPerson(p, 'other');
    expect(next.get('uid')).toBe('other');
    expect(next.get('projectId')).toBe('project');
    expect(next.get('date')).toBe('2026-10-09');
    expect(next.has('record')).toBe(false);
    expect(next.has('cursor')).toBe(false);
    expect(p.has('record')).toBe(true);
    expect(calendarPerson(updateCalendarPerson(next, 'me'), 'me').mode).toBe(
      'own',
    );
  });
  it('complete calendar canonical totals normalized, no topic filter stage2', () => {
    expect(calendarReport(data, 'me', 'own').byProject).toEqual([
      { projectId: 'project', minutes: 60 },
    ]);
    expect(calendarReport(data, 'me', 'own').byTopic).toEqual([]);
  });
  it('rejects foreign own records wrong owner/mode partial malformed and duplicate intervals', () => {
    for (const altered of [
      { ...data, viewerUid: 'other' },
      { ...data, mode: 'global' as const },
      { ...data, page: { ...data.page, partial: true as false } },
      { ...data, intervals: [{ ...data.intervals[0], uid: 'foreign' }] },
      { ...data, intervals: [data.intervals[0], data.intervals[0]] },
      { ...data, intervals: [{ ...data.intervals[0], minutes: NaN }] },
      {
        ...data,
        intervals: [{ ...data.intervals[0], effectiveEndedAt: 'bad' }],
      },
    ])
      expect(() => calendarReport(altered, 'me', 'own')).toThrow();
  });
  it('same ID for different authors remains two valid readonly global intervals', () => {
    const result = calendarReport(
      {
        ...data,
        mode: 'global',
        intervals: [
          data.intervals[0],
          { ...data.intervals[0], uid: 'other', readOnly: true },
        ],
      },
      'me',
      'global',
    );
    expect(result.intervals).toHaveLength(2);
  });
  it('calendar API isolated and foreign event cannot become authenticated drawer', () => {
    const source = readFileSync(
      new URL('./PersonalPage.tsx', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain("'getCalendarReport'");
    expect(source).not.toContain("'getCompanyReport'");
    expect(source).toContain('executeCalendarReport(');
    expect(source).toContain('executeCompanyReport(');
    expect(source).toContain('subscribeAuthorizedReport');
    expect(source).not.toContain("'getPersonalReport'");
    expect(source).toContain('executePersonalReport(');
    expect(source).not.toContain('subscribePersonalReport');
    expect(source).toContain('const localRepository = local?.repository;');
    expect(source).toContain('uid={uid}');
    expect(source).not.toContain('projectId: projectId || undefined');
    expect(source).toContain(
      'calendarRequest(params, uid, from, to, zone, includeArchived)',
    );
    expect(source).toMatch(/item.uid && item.uid !== uid\s*\? \(/);
    expect(
      source.split('item.uid && item.uid !== uid ? (')[1].split(') : (')[0],
    ).not.toContain('<RouterLink');
    expect(source).toContain('reportQuery === queryIdentity');
    expect(source).toContain('privacyBlocked');
    expect(source).toContain('directory.owner === uid');
    expect(source).toContain('directory.revision === accessRevision');
    expect(source).toContain('Todas as pessoas · até 10');
    const timeline = readFileSync(
      new URL('./CalendarTimeline.tsx', import.meta.url),
      'utf8',
    );
    expect(timeline).toMatch(/e.item.uid && e.item.uid !== viewerUid\s*\? \(/);
    expect(
      timeline
        .split('e.item.uid && e.item.uid !== viewerUid ? (')[1]
        .split(') : (')[0],
    ).not.toContain('<RouterLink');
    expect(timeline).toMatch(
      /JSON.stringify\(\[\s*e.item.uid \|\| viewerUid,\s*e.item.id,/,
    );
    expect(timeline).toContain('authorLabel(e.item.uid)');
  });
});
